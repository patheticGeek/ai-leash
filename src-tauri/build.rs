fn main() {
    // Read via `option_env!` in `lib.rs` to badge a CI PR build's window
    // title — Cargo doesn't otherwise know to rebuild when only an env var
    // (not any source file) changes.
    println!("cargo:rerun-if-env-changed=AI_LEASH_BUILD_CHANNEL");
    tauri_build::build()
}
