//! Command-latency benchmark for comparing build profiles (#86). Runs the
//! Rust side of the commands the UI calls most (sidebar list, opening a
//! chat, the board, the `@` picker), and the JSON encoding Tauri does on
//! the way back, against a copy of a real history database. Ignored by
//! default; run it under each profile to compare:
//!
//! ```sh
//! sqlite3 ~/.config/ai-leash/history.db ".backup /tmp/al-bench.db"
//! AI_LEASH_BENCH_DB=/tmp/al-bench.db cargo test bench_commands -- --ignored --nocapture
//! AI_LEASH_BENCH_DB=/tmp/al-bench.db cargo test --release bench_commands -- --ignored --nocapture
//! ```

use std::time::Instant;

fn time<T>(label: &str, runs: u32, mut f: impl FnMut() -> T) {
    let _ = f(); // warm the page cache and statement cache
    let start = Instant::now();
    for _ in 0..runs {
        std::hint::black_box(f());
    }
    let per = start.elapsed() / runs;
    println!("{label:<44} {:>9.2} ms", per.as_secs_f64() * 1000.0);
}

#[test]
#[ignore]
fn bench_commands() {
    let Ok(path) = std::env::var("AI_LEASH_BENCH_DB") else {
        eprintln!("set AI_LEASH_BENCH_DB to a copy of history.db");
        return;
    };
    let profile = if cfg!(debug_assertions) {
        "dev (debug_assertions on)"
    } else {
        "release"
    };
    println!("profile: {profile}");
    let db = crate::db::Db::open(path.into());

    let convs = crate::db::list_all_conversations(&db);
    let biggest = convs
        .iter()
        .map(|c| (crate::db::load_messages(&db, &c.id).len(), c.id.clone()))
        .max()
        .map(|(_, id)| id)
        .unwrap_or_default();
    let root = convs
        .first()
        .map(|c| c.project_root.clone())
        .unwrap_or_default();
    let n = crate::db::load_messages(&db, &biggest).len();

    time("list_all_conversations + json", 20, || {
        serde_json::to_string(&crate::db::list_all_conversations(&db)).unwrap()
    });
    time(&format!("load_messages ({n} msgs) + json"), 10, || {
        serde_json::to_string(&crate::db::load_messages(&db, &biggest)).unwrap()
    });
    time("list_tasks + json", 20, || {
        serde_json::to_string(&crate::db::list_tasks(&db, &root, None)).unwrap()
    });
    time("board_summaries + json", 20, || {
        serde_json::to_string(&crate::db::board_summaries(&db)).unwrap()
    });
    let repo = env!("CARGO_MANIFEST_DIR").to_string() + "/..";
    time("search_mentions (this repo, \"chat\")", 5, || {
        crate::mentions::search_mentions(repo.clone(), "chat".into())
    });
    time("search_files (this repo, \"tsx\")", 5, || {
        crate::commands::search_files(repo.clone(), "tsx".into())
    });
}
