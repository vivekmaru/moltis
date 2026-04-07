use std::time::Duration;

use {
    crate::state::GatewayState,
    moltis_projects::Project,
    moltis_protocol::{ErrorShape, error_codes},
};

use crate::{
    auth::{SshAuthMode, SshResolvedTarget, SshTargetEntry},
    broadcast::{BroadcastOpts, broadcast},
    machine::{LOCAL_MACHINE_ID, MachineDescriptor, SANDBOX_MACHINE_ID},
};

use super::MethodRegistry;

fn ssh_summary_json(target: &str) -> serde_json::Value {
    serde_json::json!({
        "nodeId": crate::node_exec::ssh_node_id(target),
        "displayName": format!("SSH: {target}"),
        "platform": "ssh",
        "version": serde_json::Value::Null,
        "capabilities": ["system.run"],
        "commands": ["system.run"],
        "remoteIp": serde_json::Value::Null,
        "telemetry": {
            "memTotal": serde_json::Value::Null,
            "memAvailable": serde_json::Value::Null,
            "cpuCount": serde_json::Value::Null,
            "cpuUsage": serde_json::Value::Null,
            "uptimeSecs": serde_json::Value::Null,
            "services": ["ssh"],
            "diskTotal": serde_json::Value::Null,
            "diskAvailable": serde_json::Value::Null,
            "runtimes": [],
            "stale": false,
        },
        "providers": [],
    })
}

fn ssh_target_summary_json(target: &SshTargetEntry) -> serde_json::Value {
    let auth_service = match target.auth_mode {
        SshAuthMode::System => "ssh-system",
        SshAuthMode::Managed => "ssh-managed",
    };
    serde_json::json!({
        "nodeId": format!("ssh:target:{}", target.id),
        "displayName": format!("SSH: {}", target.label),
        "platform": "ssh",
        "version": serde_json::Value::Null,
        "capabilities": ["system.run"],
        "commands": ["system.run"],
        "remoteIp": serde_json::Value::Null,
        "hostPinned": target.known_host.is_some(),
        "telemetry": {
            "memTotal": serde_json::Value::Null,
            "memAvailable": serde_json::Value::Null,
            "cpuCount": serde_json::Value::Null,
            "cpuUsage": serde_json::Value::Null,
            "uptimeSecs": serde_json::Value::Null,
            "services": ["ssh", auth_service],
            "diskTotal": serde_json::Value::Null,
            "diskAvailable": serde_json::Value::Null,
            "runtimes": [],
            "stale": false,
        },
        "providers": [],
    })
}

fn ssh_detail_json(target: &str) -> serde_json::Value {
    serde_json::json!({
        "nodeId": crate::node_exec::ssh_node_id(target),
        "displayName": format!("SSH: {target}"),
        "platform": "ssh",
        "version": serde_json::Value::Null,
        "capabilities": ["system.run"],
        "commands": ["system.run"],
        "permissions": [],
        "pathEnv": serde_json::Value::Null,
        "remoteIp": serde_json::Value::Null,
        "connectedAt": serde_json::Value::Null,
        "telemetry": {
            "memTotal": serde_json::Value::Null,
            "memAvailable": serde_json::Value::Null,
            "cpuCount": serde_json::Value::Null,
            "cpuUsage": serde_json::Value::Null,
            "uptimeSecs": serde_json::Value::Null,
            "services": ["ssh"],
            "diskTotal": serde_json::Value::Null,
            "diskAvailable": serde_json::Value::Null,
            "runtimes": [],
            "stale": false,
        },
        "providers": [],
    })
}

fn ssh_target_detail_json(target: &SshResolvedTarget) -> serde_json::Value {
    let auth_service = match target.auth_mode {
        SshAuthMode::System => "ssh-system",
        SshAuthMode::Managed => "ssh-managed",
    };
    serde_json::json!({
        "nodeId": target.node_id,
        "displayName": format!("SSH: {}", target.label),
        "platform": "ssh",
        "version": serde_json::Value::Null,
        "capabilities": ["system.run"],
        "commands": ["system.run"],
        "permissions": [],
        "pathEnv": serde_json::Value::Null,
        "remoteIp": serde_json::Value::Null,
        "hostPinned": target.known_host.is_some(),
        "connectedAt": serde_json::Value::Null,
        "telemetry": {
            "memTotal": serde_json::Value::Null,
            "memAvailable": serde_json::Value::Null,
            "cpuCount": serde_json::Value::Null,
            "cpuUsage": serde_json::Value::Null,
            "uptimeSecs": serde_json::Value::Null,
            "services": ["ssh", auth_service],
            "diskTotal": serde_json::Value::Null,
            "diskAvailable": serde_json::Value::Null,
            "runtimes": [],
            "stale": false,
        },
        "providers": [],
    })
}

fn now_ms() -> u64 {
    (time::OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000) as u64
}

async fn persist_project_machine_binding(
    state: &std::sync::Arc<GatewayState>,
    session_key: &str,
    machine_id: &str,
) {
    let Some(ref meta) = state.services.session_metadata else {
        return;
    };
    let Some(entry) = meta.get(session_key).await else {
        return;
    };
    let Some(project_id) = entry.project_id else {
        return;
    };

    let project_value = match state
        .services
        .project
        .get(serde_json::json!({ "id": project_id }))
        .await
    {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!(session_key, %error, "failed to load project for machine binding");
            return;
        },
    };
    let Some(mut project) = serde_json::from_value::<Option<Project>>(project_value)
        .ok()
        .flatten()
    else {
        return;
    };

    if project.preferred_machine_id.as_deref() == Some(machine_id) {
        return;
    }

    project.preferred_machine_id = Some(machine_id.to_string());
    project.updated_at = now_ms();
    let payload = match serde_json::to_value(&project) {
        Ok(payload) => payload,
        Err(error) => {
            tracing::warn!(project_id = %project.id, %error, "failed to serialize project update");
            return;
        },
    };
    if let Err(error) = state.services.project.upsert(payload).await {
        tracing::warn!(project_id = %project.id, %error, "failed to persist project machine binding");
    }
}

pub(super) fn register(reg: &mut MethodRegistry) {
    reg.register(
        "machines.list",
        Box::new(|ctx| {
            Box::pin(async move {
                Ok(
                    serde_json::to_value(crate::machine::list_machines(&ctx.state).await)
                        .unwrap_or_else(|_| serde_json::json!([])),
                )
            })
        }),
    );

    reg.register(
        "machines.get",
        Box::new(|ctx| {
            Box::pin(async move {
                let machine_id = ctx
                    .params
                    .get("machineId")
                    .or_else(|| ctx.params.get("machine_id"))
                    .and_then(|value| value.as_str())
                    .ok_or_else(|| {
                        ErrorShape::new(error_codes::INVALID_REQUEST, "missing machineId")
                    })?;
                crate::machine::resolve_machine(&ctx.state, machine_id)
                    .await
                    .map(|machine| serde_json::to_value(machine).unwrap_or(serde_json::Value::Null))
                    .ok_or_else(|| {
                        ErrorShape::new(
                            error_codes::INVALID_REQUEST,
                            format!("machine '{machine_id}' not found"),
                        )
                    })
            })
        }),
    );

    reg.register(
        "machines.set_session",
        Box::new(|ctx| {
            Box::pin(async move {
                let session_key = ctx
                    .params
                    .get("session_key")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        ErrorShape::new(
                            error_codes::INVALID_REQUEST,
                            "missing 'session_key' parameter",
                        )
                    })?;
                let machine_id = ctx
                    .params
                    .get("machineId")
                    .or_else(|| ctx.params.get("machine_id"))
                    .and_then(|value| value.as_str())
                    .unwrap_or(LOCAL_MACHINE_ID);

                let Some(ref meta) = ctx.state.services.session_metadata else {
                    return Err(ErrorShape::new(
                        error_codes::UNAVAILABLE,
                        "session metadata not available",
                    ));
                };
                meta.upsert(session_key, None)
                    .await
                    .map_err(|e| ErrorShape::new(error_codes::UNAVAILABLE, e.to_string()))?;

                let machine = match machine_id {
                    LOCAL_MACHINE_ID => {
                        meta.set_node_id(session_key, None).await.map_err(|e| {
                            ErrorShape::new(error_codes::UNAVAILABLE, e.to_string())
                        })?;
                        meta.set_sandbox_enabled(session_key, Some(false)).await;
                        if let Some(router) = ctx.state.sandbox_router.as_ref() {
                            router.set_override(session_key, false).await;
                        }
                        MachineDescriptor::local()
                    },
                    SANDBOX_MACHINE_ID => {
                        if !crate::machine::sandbox_machine_available(&ctx.state) {
                            return Err(ErrorShape::new(
                                error_codes::INVALID_REQUEST,
                                "sandbox machine is not available",
                            ));
                        }
                        meta.set_node_id(session_key, None).await.map_err(|e| {
                            ErrorShape::new(error_codes::UNAVAILABLE, e.to_string())
                        })?;
                        meta.set_sandbox_enabled(session_key, Some(true)).await;
                        if let Some(router) = ctx.state.sandbox_router.as_ref() {
                            router.set_override(session_key, true).await;
                        }
                        MachineDescriptor::sandbox(true)
                    },
                    _ => {
                        let resolved = crate::machine::resolve_machine(&ctx.state, machine_id)
                            .await
                            .ok_or_else(|| {
                                ErrorShape::new(
                                    error_codes::INVALID_REQUEST,
                                    format!("machine '{machine_id}' not found"),
                                )
                            })?;
                        meta.set_node_id(session_key, Some(&resolved.id))
                            .await
                            .map_err(|e| {
                                ErrorShape::new(error_codes::UNAVAILABLE, e.to_string())
                            })?;
                        meta.set_sandbox_enabled(session_key, Some(false)).await;
                        if let Some(router) = ctx.state.sandbox_router.as_ref() {
                            router.set_override(session_key, false).await;
                        }
                        resolved
                    },
                };
                persist_project_machine_binding(&ctx.state, session_key, &machine.id).await;

                broadcast(
                    &ctx.state,
                    "session",
                    serde_json::json!({
                        "kind": "patched",
                        "sessionKey": session_key,
                    }),
                    BroadcastOpts::default(),
                )
                .await;
                broadcast(
                    &ctx.state,
                    "chat",
                    serde_json::json!({
                        "sessionKey": session_key,
                        "state": "notice",
                        "title": "Execution Machine",
                        "message": format!("Execution machine set to {}.", machine.label),
                    }),
                    BroadcastOpts::default(),
                )
                .await;

                let mut payload = serde_json::Map::from_iter([
                    ("ok".to_string(), serde_json::Value::Bool(true)),
                    (
                        "machineId".to_string(),
                        serde_json::Value::String(machine.id.clone()),
                    ),
                ]);
                payload.extend(crate::machine::session_contract_fields(&machine));

                Ok(serde_json::Value::Object(payload))
            })
        }),
    );

    // node.list
    reg.register(
        "node.list",
        Box::new(|ctx| {
            Box::pin(async move {
                let inner = ctx.state.inner.read().await;
                let mut list: Vec<_> = inner
                    .nodes
                    .list()
                    .iter()
                    .map(|n| {
                        serde_json::json!({
                            "nodeId": n.node_id,
                            "displayName": n.display_name,
                            "platform": n.platform,
                            "version": n.version,
                            "capabilities": n.capabilities,
                            "commands": n.commands,
                            "remoteIp": n.remote_ip,
                            "telemetry": {
                                "memTotal": n.mem_total,
                                "memAvailable": n.mem_available,
                                "cpuCount": n.cpu_count,
                                "cpuUsage": n.cpu_usage,
                                "uptimeSecs": n.uptime_secs,
                                "services": n.services,
                                "diskTotal": n.disk_total,
                                "diskAvailable": n.disk_available,
                                "runtimes": n.runtimes,
                                "stale": n.last_telemetry.is_some_and(
                                    |t| t.elapsed() > Duration::from_secs(120),
                                ),
                            },
                            "providers": n.providers.iter().map(|p| {
                                serde_json::json!({
                                    "provider": p.provider,
                                    "models": p.models,
                                })
                            }).collect::<Vec<_>>(),
                        })
                    })
                    .collect();
                drop(inner);
                if let Some(store) = ctx.state.credential_store.as_ref() {
                    match store.list_ssh_targets().await {
                        Ok(targets) => {
                            for target in targets {
                                list.push(ssh_target_summary_json(&target));
                            }
                        },
                        Err(error) => tracing::warn!(%error, "failed to list managed ssh targets"),
                    }
                }
                if let Some(target) = crate::machine::configured_legacy_ssh_target() {
                    list.push(ssh_summary_json(&target));
                }
                Ok(serde_json::json!(list))
            })
        }),
    );

    // node.describe
    reg.register(
        "node.describe",
        Box::new(|ctx| {
            Box::pin(async move {
                let node_id = ctx
                    .params
                    .get("nodeId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        ErrorShape::new(error_codes::INVALID_REQUEST, "missing nodeId")
                    })?;
                if let Some(store) = ctx.state.credential_store.as_ref() {
                    match store.resolve_ssh_target(node_id).await {
                        Ok(Some(target)) => return Ok(ssh_target_detail_json(&target)),
                        Ok(None) => {},
                        Err(error) => {
                            tracing::warn!(%error, node_id, "failed to resolve managed ssh target")
                        },
                    }
                }
                if let Some(target) = crate::machine::configured_legacy_ssh_target()
                    && crate::node_exec::ssh_target_matches(node_id, &target)
                {
                    return Ok(ssh_detail_json(&target));
                }
                let inner = ctx.state.inner.read().await;
                let node = inner
                    .nodes
                    .get(node_id)
                    .ok_or_else(|| ErrorShape::new(error_codes::UNAVAILABLE, "node not found"))?;
                Ok(serde_json::json!({
                    "nodeId": node.node_id,
                    "displayName": node.display_name,
                    "platform": node.platform,
                    "version": node.version,
                    "capabilities": node.capabilities,
                    "commands": node.commands,
                    "permissions": node.permissions,
                    "pathEnv": node.path_env,
                    "remoteIp": node.remote_ip,
                    "connectedAt": node.connected_at.elapsed().as_secs(),
                    "telemetry": {
                        "memTotal": node.mem_total,
                        "memAvailable": node.mem_available,
                        "cpuCount": node.cpu_count,
                        "cpuUsage": node.cpu_usage,
                        "uptimeSecs": node.uptime_secs,
                        "services": node.services,
                        "diskTotal": node.disk_total,
                        "diskAvailable": node.disk_available,
                        "runtimes": node.runtimes,
                        "stale": node.last_telemetry.is_some_and(
                            |t| t.elapsed() > Duration::from_secs(120),
                        ),
                    },
                    "providers": node.providers.iter().map(|p| {
                        serde_json::json!({
                            "provider": p.provider,
                            "models": p.models,
                        })
                    }).collect::<Vec<_>>(),
                }))
            })
        }),
    );

    // node.rename
    reg.register(
        "node.rename",
        Box::new(|ctx| {
            Box::pin(async move {
                let node_id = ctx
                    .params
                    .get("nodeId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        ErrorShape::new(error_codes::INVALID_REQUEST, "missing nodeId")
                    })?;
                let name = ctx
                    .params
                    .get("displayName")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        ErrorShape::new(error_codes::INVALID_REQUEST, "missing displayName")
                    })?;
                let mut inner = ctx.state.inner.write().await;
                inner
                    .nodes
                    .rename(node_id, name)
                    .map_err(|e| ErrorShape::new(error_codes::UNAVAILABLE, e.to_string()))?;
                Ok(serde_json::json!({}))
            })
        }),
    );

    // nodes.set_session: assign a node to a chat session
    reg.register(
        "nodes.set_session",
        Box::new(|ctx| {
            Box::pin(async move {
                let session_key = ctx
                    .params
                    .get("session_key")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        ErrorShape::new(
                            error_codes::INVALID_REQUEST,
                            "missing 'session_key' parameter",
                        )
                    })?;
                // node_id can be null to clear the node assignment.
                let node_id = ctx.params.get("node_id").and_then(|v| v.as_str());
                let resolved_node_id = if let Some(nid) = node_id {
                    if let Some(store) = ctx.state.credential_store.as_ref()
                        && let Some(target) = store
                            .resolve_ssh_target(nid)
                            .await
                            .map_err(|e| ErrorShape::new(error_codes::UNAVAILABLE, e.to_string()))?
                    {
                        Some(target.node_id)
                    } else if let Some(target) = crate::machine::configured_legacy_ssh_target()
                        && crate::node_exec::ssh_target_matches(nid, &target)
                    {
                        Some(crate::node_exec::ssh_node_id(&target))
                    } else {
                        let inner = ctx.state.inner.read().await;
                        if inner.nodes.get(nid).is_none() {
                            return Err(ErrorShape::new(
                                error_codes::INVALID_REQUEST,
                                format!("node '{nid}' not found or not connected"),
                            ));
                        }
                        Some(nid.to_string())
                    }
                } else {
                    None
                };

                let Some(ref meta) = ctx.state.services.session_metadata else {
                    return Err(ErrorShape::new(
                        error_codes::UNAVAILABLE,
                        "session metadata not available",
                    ));
                };
                meta.upsert(session_key, None)
                    .await
                    .map_err(|e| ErrorShape::new(error_codes::UNAVAILABLE, e.to_string()))?;
                meta.set_node_id(session_key, resolved_node_id.as_deref())
                    .await
                    .map_err(|e| ErrorShape::new(error_codes::UNAVAILABLE, e.to_string()))?;
                persist_project_machine_binding(
                    &ctx.state,
                    session_key,
                    resolved_node_id.as_deref().unwrap_or(LOCAL_MACHINE_ID),
                )
                .await;
                Ok(serde_json::json!({ "ok": true, "node_id": resolved_node_id }))
            })
        }),
    );

    // node.invoke: forward an RPC request to a connected node
    reg.register(
        "node.invoke",
        Box::new(|ctx| {
            Box::pin(async move {
                let node_id = ctx
                    .params
                    .get("nodeId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| ErrorShape::new(error_codes::INVALID_REQUEST, "missing nodeId"))?
                    .to_string();
                let command = ctx
                    .params
                    .get("command")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        ErrorShape::new(error_codes::INVALID_REQUEST, "missing command")
                    })?
                    .to_string();
                let args = ctx
                    .params
                    .get("args")
                    .cloned()
                    .unwrap_or(serde_json::json!({}));

                // Find the node's conn_id and send the invoke request.
                let invoke_id = uuid::Uuid::new_v4().to_string();
                let conn_id = {
                    let inner = ctx.state.inner.read().await;
                    let node = inner.nodes.get(&node_id).ok_or_else(|| {
                        ErrorShape::new(error_codes::UNAVAILABLE, "node not connected")
                    })?;
                    node.conn_id.clone()
                };

                // Send invoke event to the node.
                let invoke_event = moltis_protocol::EventFrame::new(
                    "node.invoke.request",
                    serde_json::json!({
                        "invokeId": invoke_id,
                        "command": command,
                        "args": args,
                    }),
                    ctx.state.next_seq(),
                );
                let event_json = serde_json::to_string(&invoke_event)
                    .map_err(|e| ErrorShape::new(error_codes::INVALID_REQUEST, e.to_string()))?;

                {
                    let inner = ctx.state.inner.read().await;
                    let node_client = inner.clients.get(&conn_id).ok_or_else(|| {
                        ErrorShape::new(error_codes::UNAVAILABLE, "node connection lost")
                    })?;
                    if !node_client.send(&event_json) {
                        return Err(ErrorShape::new(
                            error_codes::UNAVAILABLE,
                            "node send failed",
                        ));
                    }
                }

                // Set up a oneshot for the result with a timeout.
                let (tx, rx) = tokio::sync::oneshot::channel();
                {
                    let mut inner = ctx.state.inner.write().await;
                    inner
                        .pending_invokes
                        .insert(invoke_id.clone(), crate::state::PendingInvoke {
                            request_id: ctx.request_id.clone(),
                            sender: tx,
                            created_at: std::time::Instant::now(),
                        });
                }

                // Wait for result with 30s timeout.
                match tokio::time::timeout(Duration::from_secs(30), rx).await {
                    Ok(Ok(result)) => Ok(result),
                    Ok(Err(_)) => Err(ErrorShape::new(
                        error_codes::UNAVAILABLE,
                        "invoke cancelled",
                    )),
                    Err(_) => {
                        ctx.state
                            .inner
                            .write()
                            .await
                            .pending_invokes
                            .remove(&invoke_id);
                        Err(ErrorShape::new(
                            error_codes::AGENT_TIMEOUT,
                            "node invoke timeout",
                        ))
                    },
                }
            })
        }),
    );

    // node.invoke.result: node returns the result of an invoke
    reg.register(
        "node.invoke.result",
        Box::new(|ctx| {
            Box::pin(async move {
                let invoke_id = ctx
                    .params
                    .get("invokeId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        ErrorShape::new(error_codes::INVALID_REQUEST, "missing invokeId")
                    })?;
                let result = ctx
                    .params
                    .get("result")
                    .cloned()
                    .unwrap_or(serde_json::json!(null));

                let pending = ctx
                    .state
                    .inner
                    .write()
                    .await
                    .pending_invokes
                    .remove(invoke_id);
                if let Some(invoke) = pending {
                    let _ = invoke.sender.send(result);
                    Ok(serde_json::json!({}))
                } else {
                    Err(ErrorShape::new(
                        error_codes::INVALID_REQUEST,
                        "no pending invoke for this id",
                    ))
                }
            })
        }),
    );

    // node.event: node broadcasts an event to operator clients
    reg.register(
        "node.event",
        Box::new(|ctx| {
            Box::pin(async move {
                let event = ctx
                    .params
                    .get("event")
                    .and_then(|v| v.as_str())
                    .unwrap_or("node.event");
                let payload = ctx
                    .params
                    .get("payload")
                    .cloned()
                    .unwrap_or(serde_json::json!({}));

                // Intercept telemetry events to cache data in NodeSession.
                if event == "node.telemetry"
                    && let Some(node_id) = payload.get("nodeId").and_then(|v| v.as_str())
                {
                    let mem_total = payload
                        .get("mem")
                        .and_then(|m| m.get("total"))
                        .and_then(|v| v.as_u64());
                    let mem_available = payload
                        .get("mem")
                        .and_then(|m| m.get("available"))
                        .and_then(|v| v.as_u64());
                    let cpu_count = payload
                        .get("cpuCount")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as u32);
                    let cpu_usage = payload
                        .get("cpuUsage")
                        .and_then(|v| v.as_f64())
                        .map(|v| v as f32);
                    let uptime_secs = payload.get("uptime").and_then(|v| v.as_u64());
                    let services: Vec<String> = payload
                        .get("services")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(String::from))
                                .collect()
                        })
                        .unwrap_or_default();
                    let disk_total = payload
                        .get("disk")
                        .and_then(|d| d.get("total"))
                        .and_then(|v| v.as_u64());
                    let disk_available = payload
                        .get("disk")
                        .and_then(|d| d.get("available"))
                        .and_then(|v| v.as_u64());
                    let runtimes: Vec<String> = payload
                        .get("runtimes")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(String::from))
                                .collect()
                        })
                        .unwrap_or_default();

                    let mut inner = ctx.state.inner.write().await;
                    let _ = inner.nodes.update_telemetry(
                        node_id,
                        mem_total,
                        mem_available,
                        cpu_count,
                        cpu_usage,
                        uptime_secs,
                        services,
                        disk_total,
                        disk_available,
                        runtimes,
                    );
                }

                broadcast(&ctx.state, event, payload, BroadcastOpts::default()).await;
                Ok(serde_json::json!({}))
            })
        }),
    );

    // location.result: browser returns the result of a geolocation request
    reg.register(
        "location.result",
        Box::new(|ctx| {
            Box::pin(async move {
                let request_id = ctx
                    .params
                    .get("requestId")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        ErrorShape::new(error_codes::INVALID_REQUEST, "missing requestId")
                    })?;

                // Build the result value to send through the pending invoke channel.
                let result = if let Some(loc) = ctx.params.get("location") {
                    // Success: cache the location and persist to USER.md.
                    if let (Some(lat), Some(lon)) = (
                        loc.get("latitude").and_then(|v| v.as_f64()),
                        loc.get("longitude").and_then(|v| v.as_f64()),
                    ) {
                        let geo = moltis_config::GeoLocation::now(lat, lon, None);
                        ctx.state.inner.write().await.cached_location = Some(geo.clone());

                        // Persist to USER.md (best-effort).
                        let mut user = moltis_config::load_user().unwrap_or_default();
                        user.location = Some(geo);
                        if let Err(e) = moltis_config::save_user(&user) {
                            tracing::warn!(error = %e, "failed to persist location to USER.md");
                        }
                    }
                    serde_json::json!({ "location": ctx.params.get("location") })
                } else {
                    // Error (permission denied, timeout, etc.)
                    serde_json::json!({ "error": ctx.params.get("error") })
                };

                let pending = ctx
                    .state
                    .inner
                    .write()
                    .await
                    .pending_invokes
                    .remove(request_id);
                if let Some(invoke) = pending {
                    let _ = invoke.sender.send(result);
                    Ok(serde_json::json!({}))
                } else {
                    Err(ErrorShape::new(
                        error_codes::INVALID_REQUEST,
                        "no pending location request for this id",
                    ))
                }
            })
        }),
    );
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, sync::Arc, time::Instant};

    use {
        moltis_projects::{ProjectStore, SqliteProjectStore, store::new_project},
        moltis_sessions::metadata::SqliteSessionMetadata,
        moltis_tools::sandbox::{NoSandbox, RestrictedHostSandbox, SandboxConfig, SandboxRouter},
    };

    use {
        super::super::{MethodContext, MethodRegistry},
        crate::{
            auth::{AuthMode, ResolvedAuth},
            nodes::NodeSession,
            project::LiveProjectService,
            services::GatewayServices,
            state::GatewayState,
        },
    };

    async fn sqlite_pool() -> sqlx::SqlitePool {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:")
            .await
            .expect("sqlite pool");
        moltis_projects::run_migrations(&pool)
            .await
            .expect("project migrations");
        SqliteSessionMetadata::init(&pool)
            .await
            .expect("session metadata init");
        pool
    }

    fn test_state_with_router(
        metadata: Arc<SqliteSessionMetadata>,
        project_service: Option<Arc<dyn crate::services::ProjectService>>,
        sandbox_router: Option<Arc<SandboxRouter>>,
    ) -> Arc<GatewayState> {
        let mut services = GatewayServices::noop().with_session_metadata(metadata);
        if let Some(project) = project_service {
            services = services.with_project(project);
        }
        GatewayState::with_options(
            ResolvedAuth {
                mode: AuthMode::Token,
                token: None,
                password: None,
            },
            services,
            sandbox_router,
            None,
            None,
            false,
            false,
            false,
            None,
            None,
            18789,
            false,
            None,
            None,
            #[cfg(feature = "metrics")]
            None,
            #[cfg(feature = "metrics")]
            None,
            #[cfg(feature = "vault")]
            None,
        )
    }

    fn test_state(
        metadata: Arc<SqliteSessionMetadata>,
        project_service: Option<Arc<dyn crate::services::ProjectService>>,
    ) -> Arc<GatewayState> {
        test_state_with_router(metadata, project_service, None)
    }

    fn operator_scopes(scope: &str) -> Vec<String> {
        vec![scope.to_string()]
    }

    fn test_node(node_id: &str, label: &str) -> NodeSession {
        NodeSession {
            node_id: node_id.to_string(),
            conn_id: format!("conn-{node_id}"),
            display_name: Some(label.to_string()),
            platform: "linux".to_string(),
            version: "1.0.0".to_string(),
            capabilities: vec!["system.run".to_string()],
            commands: vec!["system.run".to_string()],
            permissions: HashMap::new(),
            path_env: None,
            remote_ip: Some("10.0.0.5".to_string()),
            connected_at: Instant::now(),
            mem_total: None,
            mem_available: None,
            cpu_count: None,
            cpu_usage: None,
            uptime_secs: None,
            services: Vec::new(),
            last_telemetry: Some(Instant::now()),
            disk_total: None,
            disk_available: None,
            runtimes: Vec::new(),
            providers: Vec::new(),
        }
    }

    #[tokio::test]
    async fn machines_list_includes_local_and_connected_nodes() {
        let metadata = Arc::new(SqliteSessionMetadata::new(sqlite_pool().await));
        let state = test_state(metadata, None);
        {
            let mut inner = state.inner.write().await;
            inner.nodes.register(test_node("node-z", "Zeta"));
            inner.nodes.register(test_node("node-a", "Alpha"));
        }

        let reg = MethodRegistry::new();
        let response = reg
            .dispatch(MethodContext {
                request_id: "req-1".into(),
                method: "machines.list".into(),
                params: serde_json::json!({}),
                client_conn_id: "conn-1".into(),
                client_role: "operator".into(),
                client_scopes: operator_scopes("operator.read"),
                state,
                channel: None,
            })
            .await;

        assert!(response.ok, "machines.list should succeed");
        let payload = response.payload.expect("payload");
        let ids = payload
            .as_array()
            .expect("machine list")
            .iter()
            .filter_map(|item| item.get("id").and_then(|value| value.as_str()))
            .collect::<Vec<_>>();
        assert_eq!(ids.first().copied(), Some("local"));
        assert!(ids.contains(&"node-a"));
        assert!(ids.contains(&"node-z"));

        let labels = payload
            .as_array()
            .expect("machine list")
            .iter()
            .filter(|item| item.get("kind").and_then(|value| value.as_str()) == Some("node"))
            .filter_map(|item| item.get("label").and_then(|value| value.as_str()))
            .collect::<Vec<_>>();
        assert_eq!(labels, vec!["Alpha", "Zeta"]);
    }

    #[tokio::test]
    async fn machines_set_session_updates_session_binding() {
        let metadata = Arc::new(SqliteSessionMetadata::new(sqlite_pool().await));
        metadata.upsert("main", None).await.expect("upsert session");
        let state = test_state(Arc::clone(&metadata), None);
        {
            let mut inner = state.inner.write().await;
            inner.nodes.register(test_node("node-build", "Build box"));
        }

        let reg = MethodRegistry::new();
        let response = reg
            .dispatch(MethodContext {
                request_id: "req-2".into(),
                method: "machines.set_session".into(),
                params: serde_json::json!({
                    "session_key": "main",
                    "machineId": "node-build",
                }),
                client_conn_id: "conn-1".into(),
                client_role: "operator".into(),
                client_scopes: operator_scopes("operator.write"),
                state,
                channel: None,
            })
            .await;

        assert!(response.ok, "machines.set_session should succeed");
        let payload = response.payload.expect("payload");
        assert_eq!(payload["ok"], true);
        assert_eq!(payload["machine"]["id"], "node-build");
        assert_eq!(payload["machine"]["kind"], "node");
        assert_eq!(payload["node_id"], "node-build");
        assert_eq!(payload["sandbox_enabled"], false);

        let entry = metadata.get("main").await.expect("session entry");
        assert_eq!(entry.node_id.as_deref(), Some("node-build"));
        assert_eq!(entry.sandbox_enabled, Some(false));
    }

    #[tokio::test]
    async fn machines_set_session_updates_sandbox_router_override() {
        let metadata = Arc::new(SqliteSessionMetadata::new(sqlite_pool().await));
        metadata.upsert("main", None).await.expect("upsert session");
        let config = SandboxConfig::default();
        let router = Arc::new(SandboxRouter::with_backend(
            config.clone(),
            Arc::new(RestrictedHostSandbox::new(config)),
        ));
        let state = test_state_with_router(Arc::clone(&metadata), None, Some(Arc::clone(&router)));

        let reg = MethodRegistry::new();
        let sandbox_response = reg
            .dispatch(MethodContext {
                request_id: "req-sandbox".into(),
                method: "machines.set_session".into(),
                params: serde_json::json!({
                    "session_key": "main",
                    "machineId": "sandbox",
                }),
                client_conn_id: "conn-1".into(),
                client_role: "operator".into(),
                client_scopes: operator_scopes("operator.write"),
                state: Arc::clone(&state),
                channel: None,
            })
            .await;

        assert!(sandbox_response.ok, "sandbox machine switch should succeed");
        assert!(router.is_sandboxed("main").await);

        let local_response = reg
            .dispatch(MethodContext {
                request_id: "req-local".into(),
                method: "machines.set_session".into(),
                params: serde_json::json!({
                    "session_key": "main",
                    "machineId": "local",
                }),
                client_conn_id: "conn-1".into(),
                client_role: "operator".into(),
                client_scopes: operator_scopes("operator.write"),
                state,
                channel: None,
            })
            .await;

        assert!(local_response.ok, "local machine switch should succeed");
        assert!(!router.is_sandboxed("main").await);
    }

    #[tokio::test]
    async fn machines_list_marks_sandbox_unavailable_without_real_backend() {
        let metadata = Arc::new(SqliteSessionMetadata::new(sqlite_pool().await));
        let config = SandboxConfig::default();
        let router = Arc::new(SandboxRouter::with_backend(config, Arc::new(NoSandbox)));
        let state = test_state_with_router(metadata, None, Some(router));

        let reg = MethodRegistry::new();
        let response = reg
            .dispatch(MethodContext {
                request_id: "req-sandbox-list".into(),
                method: "machines.list".into(),
                params: serde_json::json!({}),
                client_conn_id: "conn-1".into(),
                client_role: "operator".into(),
                client_scopes: operator_scopes("operator.read"),
                state,
                channel: None,
            })
            .await;

        assert!(response.ok, "machines.list should succeed");
        let payload = response.payload.expect("payload");
        let sandbox = payload
            .as_array()
            .expect("machine list")
            .iter()
            .find(|item| item.get("id").and_then(|value| value.as_str()) == Some("sandbox"))
            .expect("sandbox machine present");
        assert_eq!(sandbox["available"], false);
        assert_eq!(sandbox["health"], "unavailable");
    }

    #[tokio::test]
    async fn machines_set_session_persists_workspace_preferred_machine() {
        let pool = sqlite_pool().await;
        let project_store: Arc<dyn ProjectStore> = Arc::new(SqliteProjectStore::new(pool.clone()));
        let project_service = Arc::new(LiveProjectService::new(Arc::clone(&project_store)))
            as Arc<dyn crate::services::ProjectService>;
        let metadata = Arc::new(SqliteSessionMetadata::new(pool));
        metadata.upsert("main", None).await.expect("upsert session");
        project_store
            .upsert(new_project("ops".into(), "Ops".into(), "/tmp/ops".into()))
            .await
            .expect("upsert project");
        metadata
            .set_project_id("main", Some("ops".to_string()))
            .await;

        let state = test_state(Arc::clone(&metadata), Some(project_service));
        {
            let mut inner = state.inner.write().await;
            inner.nodes.register(test_node("node-ops", "Ops box"));
        }

        let reg = MethodRegistry::new();
        let response = reg
            .dispatch(MethodContext {
                request_id: "req-3".into(),
                method: "machines.set_session".into(),
                params: serde_json::json!({
                    "session_key": "main",
                    "machineId": "node-ops",
                }),
                client_conn_id: "conn-1".into(),
                client_role: "operator".into(),
                client_scopes: operator_scopes("operator.write"),
                state,
                channel: None,
            })
            .await;

        assert!(response.ok, "machines.set_session should succeed");
        let project = project_store
            .get("ops")
            .await
            .expect("get project")
            .expect("project");
        assert_eq!(project.preferred_machine_id.as_deref(), Some("node-ops"));
    }
}
