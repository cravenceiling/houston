use super::types::{Provider, SessionStatus};
use crate::cli_process::run_cli_process;
use crate::session_update::SessionUpdate;
use tokio::process::Command;
use tokio::sync::mpsc;

pub(crate) async fn spawn_opencode(
    tx: &mpsc::UnboundedSender<SessionUpdate>,
    prompt: String,
    working_dir: Option<std::path::PathBuf>,
    model: Option<String>,
    system_prompt: Option<String>,
) {
    tracing::info!("[houston:session] spawning opencode run --format json");

    if let Some(ref dir) = working_dir {
        if !dir.is_dir() {
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(format!(
                "Working directory not found: {}. Was it deleted?",
                dir.display()
            ))));
            return;
        }
    }

    let mut cmd = build_opencode_command(
        working_dir.as_deref(),
        model.as_deref(),
        system_prompt.as_deref(),
    );

    run_cli_process(tx, &mut cmd, &prompt, Provider::OpenCodeGo).await;
}

fn build_opencode_command(
    working_dir: Option<&std::path::Path>,
    model: Option<&str>,
    system_prompt: Option<&str>,
) -> Command {
    let mut cmd = Command::new("opencode");
    cmd.env("PATH", super::claude_path::shell_path());
    cmd.args(["run", "--format", "json", "--thinking", "--dangerously-skip-permissions"]);

    if let Some(m) = model {
        cmd.arg("--model").arg(m);
    }
    if let Some(sp) = system_prompt {
        cmd.arg("--system-prompt").arg(sp);
    }

    if let Some(dir) = working_dir {
        cmd.current_dir(dir);
    }

    cmd
}