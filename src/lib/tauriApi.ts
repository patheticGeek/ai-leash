import { invoke } from "@tauri-apps/api/core";

export interface DirEntryInfo {
  name: string;
  path: string;
  isDir: boolean;
}

export const api = {
  setProjectRoot: (path: string) => invoke<void>("set_project_root", { path }),
  getProjectRoot: () => invoke<string | null>("get_project_root"),
  listDir: (path?: string) => invoke<DirEntryInfo[]>("list_dir", { path }),
  readFileText: (path: string) => invoke<string>("read_file_text", { path }),
  writeFileText: (path: string, contents: string) =>
    invoke<void>("write_file_text", { path, contents }),
  ptySpawn: (cwd: string | undefined, cols: number, rows: number) =>
    invoke<string>("pty_spawn", { cwd, cols, rows }),
  ptyWrite: (id: string, data: string) => invoke<void>("pty_write", { id, data }),
  ptyResize: (id: string, cols: number, rows: number) =>
    invoke<void>("pty_resize", { id, cols, rows }),
  ptyKill: (id: string) => invoke<void>("pty_kill", { id }),
  listOllamaModels: () => invoke<string[]>("list_ollama_models"),
};
