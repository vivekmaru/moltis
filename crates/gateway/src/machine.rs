use std::{sync::Arc, time::Duration};

use serde::Serialize;

use crate::{
    auth::{SshAuthMode, SshTargetEntry},
    nodes::NodeSession,
    state::GatewayState,
};

pub const LOCAL_MACHINE_ID: &str = "local";
pub const SANDBOX_MACHINE_ID: &str = "sandbox";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MachineKind {
    Local,
    Sandbox,
    Ssh,
    Node,
}

impl MachineKind {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Sandbox => "sandbox",
            Self::Ssh => "ssh",
            Self::Node => "node",
        }
    }

    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            Self::Local => "Local host",
            Self::Sandbox => "Sandbox",
            Self::Ssh => "SSH target",
            Self::Node => "Paired node",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MachineTrustState {
    TrustedLocal,
    Sandboxed,
    ManagedSsh,
    PairedNode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MachineHealth {
    Ready,
    Degraded,
    Unavailable,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineDescriptor {
    pub id: String,
    pub label: String,
    pub kind: MachineKind,
    pub execution_route: &'static str,
    pub trust_state: MachineTrustState,
    pub health: MachineHealth,
    pub available: bool,
    pub platform: Option<String>,
    pub node_id: Option<String>,
    pub remote_ip: Option<String>,
    pub host_pinned: Option<bool>,
    pub telemetry_stale: Option<bool>,
    pub capabilities: Vec<String>,
    pub commands: Vec<String>,
}

impl MachineDescriptor {
    #[must_use]
    pub fn local() -> Self {
        Self {
            id: LOCAL_MACHINE_ID.to_string(),
            label: "Local host".to_string(),
            kind: MachineKind::Local,
            execution_route: MachineKind::Local.as_str(),
            trust_state: MachineTrustState::TrustedLocal,
            health: MachineHealth::Ready,
            available: true,
            platform: Some("local".to_string()),
            node_id: None,
            remote_ip: None,
            host_pinned: None,
            telemetry_stale: None,
            capabilities: vec!["system.run".to_string()],
            commands: vec!["system.run".to_string()],
        }
    }

    #[must_use]
    pub fn sandbox(available: bool) -> Self {
        Self {
            id: SANDBOX_MACHINE_ID.to_string(),
            label: "Sandbox".to_string(),
            kind: MachineKind::Sandbox,
            execution_route: MachineKind::Sandbox.as_str(),
            trust_state: MachineTrustState::Sandboxed,
            health: if available {
                MachineHealth::Ready
            } else {
                MachineHealth::Unavailable
            },
            available,
            platform: Some("sandbox".to_string()),
            node_id: None,
            remote_ip: None,
            host_pinned: None,
            telemetry_stale: None,
            capabilities: vec!["system.run".to_string()],
            commands: vec!["system.run".to_string()],
        }
    }

    #[must_use]
    pub fn session_binding(
        kind: MachineKind,
        node_id: Option<&str>,
        sandbox_available: bool,
    ) -> Self {
        match kind {
            MachineKind::Local => Self::local(),
            MachineKind::Sandbox => Self::sandbox(sandbox_available),
            MachineKind::Ssh => {
                let id = node_id.unwrap_or("ssh:unresolved");
                Self {
                    id: id.to_string(),
                    label: "SSH target".to_string(),
                    kind,
                    execution_route: kind.as_str(),
                    trust_state: MachineTrustState::ManagedSsh,
                    health: if node_id.is_some() {
                        MachineHealth::Ready
                    } else {
                        MachineHealth::Unavailable
                    },
                    available: node_id.is_some(),
                    platform: Some("ssh".to_string()),
                    node_id: node_id.map(ToOwned::to_owned),
                    remote_ip: None,
                    host_pinned: None,
                    telemetry_stale: None,
                    capabilities: vec!["system.run".to_string()],
                    commands: vec!["system.run".to_string()],
                }
            },
            MachineKind::Node => {
                let id = node_id.unwrap_or("node:unresolved");
                Self {
                    id: id.to_string(),
                    label: "Paired node".to_string(),
                    kind,
                    execution_route: kind.as_str(),
                    trust_state: MachineTrustState::PairedNode,
                    health: if node_id.is_some() {
                        MachineHealth::Ready
                    } else {
                        MachineHealth::Unavailable
                    },
                    available: node_id.is_some(),
                    platform: Some("node".to_string()),
                    node_id: node_id.map(ToOwned::to_owned),
                    remote_ip: None,
                    host_pinned: None,
                    telemetry_stale: None,
                    capabilities: vec!["system.run".to_string()],
                    commands: vec!["system.run".to_string()],
                }
            },
        }
    }

    #[must_use]
    pub fn from_node(node: &NodeSession) -> Self {
        let telemetry_stale = node
            .last_telemetry
            .is_some_and(|instant| instant.elapsed() > Duration::from_secs(120));
        Self {
            id: node.node_id.clone(),
            label: node
                .display_name
                .clone()
                .unwrap_or_else(|| node.node_id.clone()),
            kind: MachineKind::Node,
            execution_route: MachineKind::Node.as_str(),
            trust_state: MachineTrustState::PairedNode,
            health: if telemetry_stale {
                MachineHealth::Degraded
            } else {
                MachineHealth::Ready
            },
            available: true,
            platform: Some(node.platform.clone()),
            node_id: Some(node.node_id.clone()),
            remote_ip: node.remote_ip.clone(),
            host_pinned: None,
            telemetry_stale: Some(telemetry_stale),
            capabilities: node.capabilities.clone(),
            commands: node.commands.clone(),
        }
    }

    #[must_use]
    pub fn from_managed_ssh_target(target: &SshTargetEntry) -> Self {
        let auth_service = match target.auth_mode {
            SshAuthMode::System => "ssh-system",
            SshAuthMode::Managed => "ssh-managed",
        };
        Self {
            id: format!("ssh:target:{}", target.id),
            label: format!("SSH: {}", target.label),
            kind: MachineKind::Ssh,
            execution_route: MachineKind::Ssh.as_str(),
            trust_state: MachineTrustState::ManagedSsh,
            health: if target.known_host.is_some() {
                MachineHealth::Ready
            } else {
                MachineHealth::Degraded
            },
            available: true,
            platform: Some("ssh".to_string()),
            node_id: Some(format!("ssh:target:{}", target.id)),
            remote_ip: None,
            host_pinned: Some(target.known_host.is_some()),
            telemetry_stale: None,
            capabilities: vec!["system.run".to_string()],
            commands: vec![auth_service.to_string()],
        }
    }

    #[must_use]
    pub fn from_legacy_ssh_target(target: &str) -> Self {
        Self {
            id: ssh_node_id(target),
            label: format!("SSH: {target}"),
            kind: MachineKind::Ssh,
            execution_route: MachineKind::Ssh.as_str(),
            trust_state: MachineTrustState::ManagedSsh,
            health: MachineHealth::Degraded,
            available: true,
            platform: Some("ssh".to_string()),
            node_id: Some(ssh_node_id(target)),
            remote_ip: None,
            host_pinned: Some(false),
            telemetry_stale: None,
            capabilities: vec!["system.run".to_string()],
            commands: vec!["ssh-system".to_string()],
        }
    }
}

#[must_use]
pub fn configured_legacy_ssh_target() -> Option<String> {
    let config = moltis_config::discover_and_load();
    config
        .tools
        .exec
        .ssh_target
        .map(|target| target.trim().to_string())
        .filter(|target| !target.is_empty())
}

#[must_use]
pub fn ssh_node_id(target: &str) -> String {
    crate::node_exec::ssh_node_id(target)
}

pub async fn list_machines(state: &Arc<GatewayState>) -> Vec<MachineDescriptor> {
    let mut machines = vec![MachineDescriptor::local()];

    if state.sandbox_router.is_some() {
        machines.push(MachineDescriptor::sandbox(true));
    }

    let mut node_machines = {
        let inner = state.inner.read().await;
        inner
            .nodes
            .list()
            .into_iter()
            .map(MachineDescriptor::from_node)
            .collect::<Vec<_>>()
    };
    node_machines.sort_by(|left, right| left.label.cmp(&right.label));
    machines.extend(node_machines);

    if let Some(store) = state.credential_store.as_ref() {
        match store.list_ssh_targets().await {
            Ok(targets) => {
                let mut ssh_targets = targets
                    .iter()
                    .map(MachineDescriptor::from_managed_ssh_target)
                    .collect::<Vec<_>>();
                ssh_targets.sort_by(|left, right| left.label.cmp(&right.label));
                machines.extend(ssh_targets);
            },
            Err(error) => {
                tracing::warn!(%error, "failed to list managed ssh targets for machine inventory")
            },
        }
    }

    if let Some(target) = configured_legacy_ssh_target() {
        machines.push(MachineDescriptor::from_legacy_ssh_target(&target));
    }

    machines
}

pub async fn resolve_machine(
    state: &Arc<GatewayState>,
    machine_id: &str,
) -> Option<MachineDescriptor> {
    match machine_id {
        LOCAL_MACHINE_ID => Some(MachineDescriptor::local()),
        SANDBOX_MACHINE_ID => {
            if state.sandbox_router.is_some() {
                Some(MachineDescriptor::sandbox(true))
            } else {
                None
            }
        },
        _ => list_machines(state)
            .await
            .into_iter()
            .find(|machine| machine.id == machine_id),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_binding_uses_stable_local_and_sandbox_ids() {
        assert_eq!(
            MachineDescriptor::session_binding(MachineKind::Local, None, false).id,
            LOCAL_MACHINE_ID
        );
        assert_eq!(
            MachineDescriptor::session_binding(MachineKind::Sandbox, None, true).id,
            SANDBOX_MACHINE_ID
        );
    }

    #[test]
    fn node_machine_marks_stale_telemetry_as_degraded() {
        let mut node = NodeSession {
            node_id: "node-a".to_string(),
            conn_id: "conn-a".to_string(),
            display_name: Some("Build box".to_string()),
            platform: "linux".to_string(),
            version: "1.0.0".to_string(),
            capabilities: vec!["system.run".to_string()],
            commands: vec!["system.run".to_string()],
            permissions: std::collections::HashMap::new(),
            path_env: None,
            remote_ip: None,
            connected_at: std::time::Instant::now(),
            mem_total: None,
            mem_available: None,
            cpu_count: None,
            cpu_usage: None,
            uptime_secs: None,
            services: Vec::new(),
            last_telemetry: Some(std::time::Instant::now() - Duration::from_secs(240)),
            disk_total: None,
            disk_available: None,
            runtimes: Vec::new(),
            providers: Vec::new(),
        };
        let machine = MachineDescriptor::from_node(&node);
        assert_eq!(machine.health, MachineHealth::Degraded);

        node.last_telemetry = Some(std::time::Instant::now());
        let refreshed = MachineDescriptor::from_node(&node);
        assert_eq!(refreshed.health, MachineHealth::Ready);
    }

    #[test]
    fn managed_ssh_target_uses_host_pinning_for_health() {
        let target = SshTargetEntry {
            id: 42,
            label: "Deploy box".to_string(),
            target: "deploy@example.com".to_string(),
            port: Some(22),
            auth_mode: SshAuthMode::Managed,
            known_host: Some("example.com ssh-ed25519 AAAA".to_string()),
            key_id: Some(7),
            key_name: Some("deploy-box".to_string()),
            is_default: false,
            created_at: "2026-04-04T00:00:00Z".to_string(),
            updated_at: "2026-04-04T00:00:00Z".to_string(),
        };

        let machine = MachineDescriptor::from_managed_ssh_target(&target);
        assert_eq!(machine.id, "ssh:target:42");
        assert_eq!(machine.kind, MachineKind::Ssh);
        assert_eq!(machine.trust_state, MachineTrustState::ManagedSsh);
        assert_eq!(machine.health, MachineHealth::Ready);
        assert_eq!(machine.host_pinned, Some(true));
        assert_eq!(machine.commands, vec!["ssh-managed".to_string()]);
    }
}
