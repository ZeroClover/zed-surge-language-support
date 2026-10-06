use zed_extension_api::{self as zed, settings::LspSettings, LanguageServerId, Result};

const DEFAULT_CLI: &str = "/Applications/Surge.app/Contents/Applications/surge-cli";
// Bounds the CLI check and registers the include-file watcher surge-cli expects.
const BRIDGE: &str = include_str!("../server/surge-lsp.mjs");
const BRIDGE_FILE: &str = "surge-lsp.mjs";

struct Surge;

// Check the advertised command, not the app version: some 6.10.0 builds lack LSP.
fn supports_stdio(help: &str) -> bool {
    help.lines().any(|line| {
        let Some(usage) = line.trim().strip_prefix("Usage:") else {
            return false;
        };
        let words: Vec<_> = usage.split_whitespace().collect();
        let command = usize::from(words.first() == Some(&"surge-cli"));
        words.get(command) == Some(&"lsp")
            && words[command + 1..]
                .iter()
                .any(|word| word.trim_matches(['[', ']', '(', ')']) == "--stdio")
    })
}

fn expand_path(path: &str, home: Option<&str>) -> Result<String> {
    if let Some(relative) = path.strip_prefix("~/") {
        let home = home.ok_or("Cannot expand ~/ without HOME; set an absolute Surge CLI path.")?;
        Ok(format!("{}/{relative}", home.trim_end_matches('/')))
    } else {
        Ok(path.to_owned())
    }
}

impl zed::Extension for Surge {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        if zed::current_platform().0 != zed::Os::Mac {
            return Err("Surge diagnostics require a local macOS Surge CLI. Syntax highlighting is available without it.".into());
        }
        let settings = LspSettings::for_worktree(id.as_ref(), worktree)?;
        let binary = settings.binary;
        let configured = binary
            .as_ref()
            .and_then(|b| b.path.as_deref())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(DEFAULT_CLI);
        let shell_env = worktree.shell_env();
        let home = shell_env
            .iter()
            .find(|(key, _)| key == "HOME")
            .map(|(_, value)| value.as_str());
        let mut command = expand_path(configured, home)?;
        if !command.contains('/') {
            command = worktree
                .which(&command)
                .ok_or_else(|| format!("Surge CLI '{command}' is not on PATH."))?;
        }
        let env: Vec<_> = binary
            .as_ref()
            .and_then(|b| b.env.clone())
            .unwrap_or_default()
            .into_iter()
            .collect();
        let bridge = std::env::current_dir()
            .map_err(|err| format!("Cannot locate the extension work directory: {err}"))?
            .join(BRIDGE_FILE);
        std::fs::write(&bridge, BRIDGE)
            .map_err(|err| format!("Cannot write {}: {err}", bridge.display()))?;
        let bridge = bridge.to_string_lossy().into_owned();
        let node = zed::node_binary_path()?;
        let output = zed::process::Command::new(&node)
            .args([bridge.as_str(), "check", command.as_str()])
            .envs(env.clone())
            .output()
            .map_err(|err| format!("Cannot run Node.js for the Surge CLI check: {err}"))?;
        if output.status != Some(0) {
            return Err(format!("Cannot run Surge CLI at {command}: {}. Set lsp.surge.binary.path to a compatible executable.", String::from_utf8_lossy(&output.stderr).trim()));
        }
        if !supports_stdio(&String::from_utf8_lossy(&output.stdout)) {
            return Err(format!("{command} does not advertise 'lsp --stdio'. Install a Surge Mac build with LSP support (the official extension requires 6.10.0+), then run 'editor: restart language server'."));
        }
        let mut args = vec![bridge, "serve".into(), command];
        args.extend(
            binary
                .and_then(|b| b.arguments)
                .unwrap_or_else(|| vec!["lsp".into(), "--stdio".into()]),
        );
        Ok(zed::Command { command: node, args, env })
    }
}

zed::register_extension!(Surge);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requires_stdio_on_the_lsp_usage_line() {
        assert!(supports_stdio(
            "Surge CLI\nUsage: surge-cli lsp [--stdio]\n"
        ));
        assert!(supports_stdio("Usage: lsp --stdio"));
        for help in [
            "Unknown help topic: lsp",
            "Usage: surge-cli lsp\n--stdio",
            "Usage: other --stdio",
            "Usage: lsp --stdio-extra",
            "Usage:",
        ] {
            assert!(!supports_stdio(help), "{help}");
        }
    }

    #[test]
    fn paths_preserve_spaces_and_expand_only_home_prefix() {
        assert_eq!(
            expand_path("~/My Apps/Surge.app/cli", Some("/Users/test")).unwrap(),
            "/Users/test/My Apps/Surge.app/cli"
        );
        assert_eq!(expand_path(DEFAULT_CLI, None).unwrap(), DEFAULT_CLI);
        assert!(expand_path("~/cli", None).is_err());
    }
}
