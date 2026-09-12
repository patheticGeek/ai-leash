// "DEV" for a `cargo tauri dev`/`vite dev` build, "PR" for a CI build off a
// pull request (`AI_LEASH_BUILD_CHANNEL`, set in
// `.github/workflows/build.yml`), `null` for an actual release build — the
// only case that should look exactly like what a user installs. Drives the
// border in `App.tsx` and the badge next to the logo in `TitleBar.tsx`; the
// window title's own copy of this same distinction is separately computed
// backend-side (`src-tauri/src/lib.rs`'s `build_label`), since Tauri sets
// the title before any frontend code runs.
export const BUILD_LABEL: "DEV" | "PR" | null = import.meta.env.DEV
  ? "DEV"
  : __BUILD_CHANNEL__ === "pr"
    ? "PR"
    : null;
