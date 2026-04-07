use std::{collections::HashMap, sync::Arc, time::Duration};

use {
    moltis_sessions::metadata::SessionEntry, moltis_tools::sandbox::SandboxRouter, serde::Serialize,
};

use crate::{
    auth::{SshAuthMode, SshTargetEntry},
    nodes::NodeSession,
    state::GatewayState,
};

pub const LOCAL_MACHINE_ID: &str = "local";
pub const SANDBOX_MACHINE_ID: &str = "sandbox";

#[derive(Debug, Clone)]
pub struct MachineInventorySnapshot {
    sandbox_available: bool,
    machines_by_id: HashMap<String, MachineDescriptor>,
}

impl MachineInventorySnapshot {
    #[must_use]
    pub fn sandbox_available(&self) -> bool {
        self.sandbox_available
    }

    #[must_use]
    pub fn resolve(&self, machine_id: &str) -> Option<MachineDescriptor> {
        self.machines_by_id.get(machine_id).cloned()
    }
}

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

#[must_use]
pub fn kind_from_machine_id(machine_id: &str) -> MachineKind {
    match machine_id {
        LOCAL_MACHINE_ID => MachineKind::Local,
        SANDBOX_MACHINE_ID => MachineKind::Sandbox,
        _ if machine_id.starts_with("ssh:") => MachineKind::Ssh,
        _ => MachineKind::Node,
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LegacySessionBinding {
    pub node_id: Option<String>,
    pub sandbox_enabled: bool,
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
pub fn legacy_session_binding(machine: &MachineDescriptor) -> LegacySessionBinding {
    LegacySessionBinding {
        node_id: match machine.kind {
            MachineKind::Local | MachineKind::Sandbox => None,
            MachineKind::Ssh | MachineKind::Node => {
                machine.node_id.clone().or_else(|| Some(machine.id.clone()))
            },
        },
        sandbox_enabled: machine.kind == MachineKind::Sandbox,
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

#[must_use]
pub fn sandbox_router_available(router: Option<&Arc<SandboxRouter>>) -> bool {
    router.is_some_and(|router| router.backend().is_real())
}

#[must_use]
pub fn sandbox_machine_available(state: &GatewayState) -> bool {
    sandbox_router_available(state.sandbox_router.as_ref())
}

pub async fn list_machines(state: &Arc<GatewayState>) -> Vec<MachineDescriptor> {
    let mut machines = vec![MachineDescriptor::local()];

    if state.sandbox_router.is_some() {
        machines.push(MachineDescriptor::sandbox(sandbox_machine_available(state)));
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

pub async fn machine_inventory_snapshot(state: &Arc<GatewayState>) -> MachineInventorySnapshot {
    let sandbox_available = sandbox_machine_available(state);
    let machines_by_id = list_machines(state)
        .await
        .into_iter()
        .map(|machine| (machine.id.clone(), machine))
        .collect();
    MachineInventorySnapshot {
        sandbox_available,
        machines_by_id,
    }
}

pub async fn resolve_machine(
    state: &Arc<GatewayState>,
    machine_id: &str,
) -> Option<MachineDescriptor> {
    match machine_id {
        LOCAL_MACHINE_ID => Some(MachineDescriptor::local()),
        SANDBOX_MACHINE_ID => {
            if state.sandbox_router.is_some() {
                Some(MachineDescriptor::sandbox(sandbox_machine_available(state)))
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

#[must_use]
pub fn session_binding_from_machine_id(
    machine_id: &str,
    sandbox_available: bool,
) -> MachineDescriptor {
    match kind_from_machine_id(machine_id) {
        MachineKind::Local => MachineDescriptor::local(),
        MachineKind::Sandbox => MachineDescriptor::sandbox(sandbox_available),
        kind => MachineDescriptor::session_binding(kind, Some(machine_id), sandbox_available),
    }
}

#[must_use]
pub fn session_machine_kind(entry: &SessionEntry, sandbox_active: bool) -> MachineKind {
    if let Some(node_id) = entry.node_id.as_deref() {
        return if node_id.starts_with("ssh:") {
            MachineKind::Ssh
        } else {
            MachineKind::Node
        };
    }

    if sandbox_active {
        MachineKind::Sandbox
    } else {
        MachineKind::Local
    }
}

#[must_use]
pub fn session_machine_descriptor(
    entry: &SessionEntry,
    sandbox_active: bool,
    sandbox_available: bool,
) -> MachineDescriptor {
    match session_machine_kind(entry, sandbox_active) {
        MachineKind::Local => MachineDescriptor::local(),
        MachineKind::Sandbox => MachineDescriptor::sandbox(sandbox_available),
        kind => {
            MachineDescriptor::session_binding(kind, entry.node_id.as_deref(), sandbox_available)
        },
    }
}

#[must_use]
fn unavailable_session_machine_descriptor(
    kind: MachineKind,
    machine_id: Option<&str>,
    sandbox_available: bool,
) -> MachineDescriptor {
    let mut machine = MachineDescriptor::session_binding(kind, None, sandbox_available);
    if let Some(machine_id) = machine_id {
        machine.id = machine_id.to_string();
        machine.node_id = Some(machine_id.to_string());
    }
    machine
}

pub async fn live_session_machine_descriptor(
    state: &Arc<GatewayState>,
    entry: &SessionEntry,
    sandbox_active: bool,
) -> MachineDescriptor {
    let inventory = machine_inventory_snapshot(state).await;
    live_session_machine_descriptor_for_inventory(&inventory, entry, sandbox_active)
}

#[must_use]
pub fn live_session_machine_descriptor_for_inventory(
    inventory: &MachineInventorySnapshot,
    entry: &SessionEntry,
    sandbox_active: bool,
) -> MachineDescriptor {
    let sandbox_available = inventory.sandbox_available();
    let kind = session_machine_kind(entry, sandbox_active);
    match kind {
        MachineKind::Local => MachineDescriptor::local(),
        MachineKind::Sandbox => MachineDescriptor::sandbox(sandbox_available),
        _ => {
            let machine_id = entry.node_id.as_deref();
            if let Some(machine_id) = machine_id
                && let Some(machine) = inventory.resolve(machine_id)
            {
                machine
            } else {
                unavailable_session_machine_descriptor(kind, machine_id, sandbox_available)
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use {super::*, moltis_sessions::metadata::SessionEntry};

    fn session_entry(key: &str) -> SessionEntry {
        SessionEntry {
            id: key.to_string(),
            key: key.to_string(),
            label: None,
            model: None,
            created_at: 0,
            updated_at: 0,
            message_count: 0,
            last_seen_message_count: 0,
            project_id: None,
            archived: false,
            worktree_branch: None,
            sandbox_enabled: None,
            sandbox_image: None,
            channel_binding: None,
            parent_session_key: None,
            fork_point: None,
            mcp_disabled: None,
            preview: None,
            agent_id: None,
            node_id: None,
            external_agent_source: None,
            version: 1,
        }
    }

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
            permissions: HashMap::new(),
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

    #[test]
    fn session_machine_descriptor_prefers_normalized_route_over_legacy_flags() {
        let mut entry = session_entry("main");
        entry.sandbox_enabled = Some(true);
        let machine = session_machine_descriptor(&entry, false, false);
        assert_eq!(machine.kind, MachineKind::Local);
        assert!(machine.available);
        assert_eq!(machine.execution_route, "local");
    }

    #[test]
    fn session_machine_descriptor_keeps_ssh_identity() {
        let mut entry = session_entry("main");
        entry.node_id = Some("ssh:target:42".to_string());
        let machine = session_machine_descriptor(&entry, false, true);
        assert_eq!(machine.kind, MachineKind::Ssh);
        assert_eq!(machine.id, "ssh:target:42");
        assert_eq!(machine.execution_route, "ssh");
    }

    #[test]
    fn legacy_session_binding_uses_machine_contract() {
        let local = legacy_session_binding(&MachineDescriptor::local());
        assert_eq!(local.node_id, None);
        assert!(!local.sandbox_enabled);

        let sandbox = legacy_session_binding(&MachineDescriptor::sandbox(true));
        assert_eq!(sandbox.node_id, None);
        assert!(sandbox.sandbox_enabled);

        let ssh = legacy_session_binding(&MachineDescriptor::session_binding(
            MachineKind::Ssh,
            Some("ssh:target:42"),
            false,
        ));
        assert_eq!(ssh.node_id.as_deref(), Some("ssh:target:42"));
        assert!(!ssh.sandbox_enabled);
    }

    #[test]
    fn live_session_machine_descriptor_for_inventory_uses_cached_machine() {
        let mut inventory = MachineInventorySnapshot {
            sandbox_available: false,
            machines_by_id: HashMap::new(),
        };
        inventory
            .machines_by_id
            .insert("node-1".to_string(), MachineDescriptor {
                id: "node-1".to_string(),
                label: "Node One".to_string(),
                kind: MachineKind::Node,
                execution_route: "node",
                trust_state: MachineTrustState::PairedNode,
                health: MachineHealth::Ready,
                available: true,
                platform: Some("linux".to_string()),
                node_id: Some("node-1".to_string()),
                remote_ip: Some("10.0.0.1".to_string()),
                host_pinned: None,
                telemetry_stale: Some(false),
                capabilities: vec!["system.run".to_string()],
                commands: vec!["system.run".to_string()],
            });

        let mut entry = session_entry("main");
        entry.node_id = Some("node-1".to_string());

        let machine = live_session_machine_descriptor_for_inventory(&inventory, &entry, false);
        assert_eq!(machine.id, "node-1");
        assert_eq!(machine.label, "Node One");
        assert_eq!(machine.health, MachineHealth::Ready);
    }

    #[tokio::test]
    async fn live_session_machine_descriptor_marks_missing_node_unavailable() {
        let metadata = Arc::new(moltis_sessions::metadata::SqliteSessionMetadata::new({
            let pool = sqlx::SqlitePool::connect("sqlite::memory:")
                .await
                .expect("sqlite pool");
            moltis_projects::run_migrations(&pool)
                .await
                .expect("project migrations");
            moltis_sessions::metadata::SqliteSessionMetadata::init(&pool)
                .await
                .expect("session metadata init");
            pool
        }));
        let state = GatewayState::new(
            crate::auth::ResolvedAuth {
                mode: crate::auth::AuthMode::Token,
                token: None,
                password: None,
            },
            crate::services::GatewayServices::noop().with_session_metadata(metadata),
        );
        let mut entry = session_entry("main");
        entry.node_id = Some("node-missing".to_string());

        let machine = live_session_machine_descriptor(&state, &entry, false).await;
        assert_eq!(machine.kind, MachineKind::Node);
        assert_eq!(machine.id, "node-missing");
        assert_eq!(machine.health, MachineHealth::Unavailable);
        assert!(!machine.available);
    }
}
