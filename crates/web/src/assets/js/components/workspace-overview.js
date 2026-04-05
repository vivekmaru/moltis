import { html } from "htm/preact";
import { useEffect, useState } from "preact/hooks";
import { onEvent } from "../events.js";
import { sendRpc } from "../helpers.js";
import { sessionStore } from "../stores/session-store.js";

function routeLabel(route) {
	switch (route) {
		case "sandbox":
			return "Sandbox";
		case "ssh":
			return "SSH";
		case "node":
			return "Node";
		default:
			return "Local";
	}
}

function sourceLabel(source) {
	switch (source) {
		case "claude_code":
			return "Claude Code";
		case "copilot":
			return "Copilot";
		case "api":
			return "API";
		case "imported":
			return "Imported";
		case "codex":
			return "Codex";
		default:
			return "Native";
	}
}

function machineLabel(machine) {
	if (!machine) return "";
	var label = machine.label || machine.id || "Unknown";
	if ((label === "Paired node" || label === "SSH target") && machine.id) {
		label = machine.id;
	}
	if (machine.available === false) {
		return `${label} (unavailable)`;
	}
	return label;
}

function humanizeMachineField(value) {
	if (!value) return "";
	return String(value)
		.replaceAll("_", " ")
		.replace(/\b\w/g, (match) => match.toUpperCase());
}

function machineGuardrail(machine) {
	switch (machine?.kind) {
		case "sandbox":
			return "Commands run inside a sandboxed container with isolated filesystem and environment boundaries.";
		case "ssh":
			return "Commands run on the selected SSH target over a managed or system SSH route.";
		case "node":
			return "Commands run on the paired node through the gateway's remote execution channel.";
		default:
			return "Commands run directly on the local host machine.";
	}
}

function machineCapabilitySummary(machine) {
	if (!Array.isArray(machine?.capabilities) || machine.capabilities.length === 0) return "No declared capabilities";
	return machine.capabilities.join(", ");
}

function machineCommandSummary(machine) {
	if (!Array.isArray(machine?.commands) || machine.commands.length === 0) return "No declared commands";
	return machine.commands.join(", ");
}

function machineTelemetryLabel(machine) {
	if (machine?.telemetryStale === true) return "Stale telemetry";
	if (machine?.telemetryStale === false) return "Fresh telemetry";
	return "";
}

function relativeTime(epochMs) {
	if (!epochMs) return "";
	return new Date(epochMs).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function Section({ title, children }) {
	return html`
		<section class="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 flex flex-col gap-2">
			<div class="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">${title}</div>
			${children}
		</section>
	`;
}

function KeyValue({ label, value, mono = false }) {
	if (!value) return null;
	return html`
		<div class="flex items-start justify-between gap-3 text-xs">
			<div class="text-[var(--muted)] shrink-0">${label}</div>
			<div class=${mono ? "font-mono text-right text-[var(--text)]" : "text-right text-[var(--text)]"}>${value}</div>
		</div>
	`;
}

function machineById(machines, machineId) {
	if (!machineId) return null;
	return machines.find((machine) => machine.id === machineId) || null;
}

function mergeMachineDetails(baseMachine, inventoryMachine) {
	if (!(baseMachine || inventoryMachine)) return null;
	return {
		...(baseMachine || {}),
		...(inventoryMachine || {}),
	};
}

function resolveMachineDetails(overview, session, machines) {
	var currentMachine = mergeMachineDetails(
		overview?.machine || session?.machine || null,
		machineById(machines, overview?.machine?.id || session?.machine?.id || null),
	);
	var preferredMachineId =
		overview?.linkedProject?.preferredMachineId || overview?.linkedProject?.preferredMachine?.id || null;
	var preferredMachine = mergeMachineDetails(
		overview?.linkedProject?.preferredMachine || null,
		machineById(machines, preferredMachineId),
	);
	return {
		currentMachine,
		preferredMachine,
		preferredMachineId,
	};
}

function OverviewBadges({ workspaceLabel, currentRoute, source, preferredMachine, approvalMode }) {
	return html`
		<div class="flex flex-wrap items-center gap-2 mb-3">
			<span class="inline-flex items-center rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text)]">
				Workspace: ${workspaceLabel}
			</span>
			<span class="inline-flex items-center rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text)]">
				Route: ${routeLabel(currentRoute)}
			</span>
			<span class="inline-flex items-center rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text)]">
				Source: ${sourceLabel(source)}
			</span>
			${
				preferredMachine &&
				html`<span class="inline-flex items-center rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text)]">
					Preferred machine: ${machineLabel(preferredMachine)}
				</span>`
			}
			<span class="inline-flex items-center rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)]">
				Approvals: ${approvalMode}
			</span>
		</div>
	`;
}

function InventoryBadge({ children, tone = "default" }) {
	var className =
		"inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]";
	if (tone === "accent") {
		className += " border-[var(--accent)] text-[var(--accent)]";
	} else if (tone === "muted") {
		className += " border-[var(--border)] text-[var(--muted)]";
	} else if (tone === "warn") {
		className += " border-[var(--warning)] text-[var(--warning)]";
	} else {
		className += " border-[var(--border)] text-[var(--text)]";
	}
	return html`<span class=${className}>${children}</span>`;
}

function CoordinationSection({ coordination }) {
	var hasCoordination =
		coordination.decision || coordination.currentPlan || coordination.nextAction || coordination.routeConstraints;
	return html`
		<${Section} title="Coordination Loop">
			<${KeyValue} label="Decision" value=${coordination.decision} />
			<${KeyValue} label="Current plan" value=${coordination.currentPlan} />
			<${KeyValue} label="Next action" value=${coordination.nextAction} />
			<${KeyValue} label="Route constraints" value=${coordination.routeConstraints} />
			${!hasCoordination && html`<div class="text-xs text-[var(--muted)]">No coordination notes captured yet.</div>`}
		</${Section}>
	`;
}

function MachinePostureSection({ machine, approvalMode }) {
	if (!machine) return null;
	return html`
		<${Section} title="Machine Posture">
			<div class="flex items-start justify-between gap-3">
				<div>
					<div class="text-sm font-medium text-[var(--text)]">${machineLabel(machine)}</div>
					<div class="text-xs text-[var(--muted)]">${machineGuardrail(machine)}</div>
				</div>
				<div class="flex flex-wrap justify-end gap-1.5">
					<${InventoryBadge}>${humanizeMachineField(machine.kind || machine.route)}</${InventoryBadge}>
					<${InventoryBadge} tone=${machine.health === "degraded" ? "warn" : machine.available === false ? "muted" : "accent"}>
						${humanizeMachineField(machine.health || "unknown")}
					</${InventoryBadge}>
					<${InventoryBadge} tone="muted">${humanizeMachineField(machine.trustState || "unknown")}</${InventoryBadge}>
				</div>
			</div>
			<${KeyValue} label="Route" value=${routeLabel(machine.executionRoute || machine.route)} />
			<${KeyValue} label="Trust" value=${humanizeMachineField(machine.trustState)} />
			<${KeyValue} label="Health" value=${humanizeMachineField(machine.health)} />
			<${KeyValue} label="Approvals" value=${approvalMode} />
			<${KeyValue} label="Platform" value=${machine.platform} />
			<${KeyValue} label="Remote IP" value=${machine.remoteIp} mono=${true} />
			<${KeyValue} label="Telemetry" value=${machineTelemetryLabel(machine)} />
			<${KeyValue} label="Host pinning" value=${machine.hostPinned == null ? "" : machine.hostPinned ? "Pinned host key" : "Not pinned"} />
			<${KeyValue} label="Capabilities" value=${machineCapabilitySummary(machine)} />
			<${KeyValue} label="Commands" value=${machineCommandSummary(machine)} />
		</${Section}>
	`;
}

function AvailableMachinesSection({ machines, currentMachineId, preferredMachineId }) {
	return html`
		<${Section} title="Available Machines">
			${
				machines.length > 0
					? machines.map(
							(machine) => html`
								<div class="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-2.5 flex flex-col gap-2">
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<div class="text-sm font-medium text-[var(--text)] truncate">${machineLabel(machine)}</div>
											<div class="text-xs text-[var(--muted)]">${machineGuardrail(machine)}</div>
										</div>
										<div class="flex flex-wrap justify-end gap-1.5">
											${machine.id === currentMachineId && html`<${InventoryBadge} tone="accent">Current</${InventoryBadge}>`}
											${machine.id === preferredMachineId && html`<${InventoryBadge}>Preferred</${InventoryBadge}>`}
											<${InventoryBadge} tone=${machine.health === "degraded" ? "warn" : machine.available === false ? "muted" : "accent"}>
												${humanizeMachineField(machine.health || "unknown")}
											</${InventoryBadge}>
										</div>
									</div>
									<div class="flex flex-wrap gap-1.5">
										<${InventoryBadge}>${humanizeMachineField(machine.kind || machine.route)}</${InventoryBadge}>
										<${InventoryBadge} tone="muted">${humanizeMachineField(machine.trustState || "unknown")}</${InventoryBadge}>
										${machineTelemetryLabel(machine) && html`<${InventoryBadge} tone="muted">${machineTelemetryLabel(machine)}</${InventoryBadge}>`}
									</div>
									<div class="grid gap-1 text-xs text-[var(--muted)]">
										<div>Route: <span class="text-[var(--text)]">${routeLabel(machine.executionRoute || machine.route)}</span></div>
										<div>Capabilities: <span class="text-[var(--text)]">${machineCapabilitySummary(machine)}</span></div>
										<div>Commands: <span class="text-[var(--text)]">${machineCommandSummary(machine)}</span></div>
									</div>
								</div>
							`,
						)
					: html`<div class="text-xs text-[var(--muted)]">No execution machines are currently visible.</div>`
			}
		</${Section}>
	`;
}

function DurableNotesSection({ durableNotes }) {
	return html`
		<${Section} title="Durable Notes">
			${
				durableNotes
					? html`<div class="text-xs leading-relaxed text-[var(--text)] whitespace-pre-wrap">${durableNotes}</div>`
					: html`<div class="text-xs text-[var(--muted)]">No durable notes saved for this workspace yet.</div>`
			}
		</${Section}>
	`;
}

function ExternalActivitiesSection({ activities }) {
	return html`
		<${Section} title="External Activity">
			${
				activities.length > 0
					? activities.map(
							(activity) => html`
								<div class="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-2.5 flex flex-col gap-1">
									<div class="flex items-center justify-between gap-2 text-xs">
										<div class="font-medium text-[var(--text)]">${activity.title || "Attached external work"}</div>
										<div class="text-[var(--muted)]">${sourceLabel(activity.source)}</div>
									</div>
									<div class="text-xs leading-relaxed text-[var(--text)]">${activity.summary}</div>
									<div class="flex items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
										<span>${relativeTime(activity.attachedAt)}</span>
										${activity.link && html`<a class="underline" href=${activity.link} target="_blank" rel="noreferrer">Open</a>`}
									</div>
								</div>
							`,
						)
					: html`<div class="text-xs text-[var(--muted)]">No Codex, Claude Code, Copilot, or API work attached yet.</div>`
			}
		</${Section}>
	`;
}

function RecentSessionsSection({ sessions }) {
	return html`
		<${Section} title="Recent Workspace Sessions">
			${
				sessions.length > 0
					? sessions.map(
							(item) => html`
								<div class="flex items-start justify-between gap-3 text-xs">
									<div class="min-w-0">
										<div class="font-medium text-[var(--text)] truncate">${item.label || item.key}</div>
										<div class="text-[var(--muted)]">
											${routeLabel(item.executionRoute)} · ${sourceLabel(item.externalAgentSource)}
										</div>
									</div>
									<div class="text-right text-[var(--muted)] shrink-0">
										<div>${item.messageCount || 0} msgs</div>
										<div>${relativeTime(item.updatedAt)}</div>
									</div>
								</div>
							`,
						)
					: html`<div class="text-xs text-[var(--muted)]">No other sessions are linked to this workspace yet.</div>`
			}
		</${Section}>
	`;
}

export function WorkspaceOverview() {
	var session = sessionStore.activeSession.value;
	var [overview, setOverview] = useState(null);
	var [machines, setMachines] = useState([]);
	var [loading, setLoading] = useState(false);
	var [refreshToken, setRefreshToken] = useState(0);

	useEffect(() => {
		if (!session?.key || session.key === "main") {
			setOverview(null);
			setMachines([]);
			return;
		}
		var cancelled = false;
		setLoading(true);
		Promise.all([sendRpc("sessions.workspace_overview", { key: session.key }), sendRpc("machines.list", {})])
			.then(([overviewRes, machinesRes]) => {
				if (cancelled) return;
				setOverview(overviewRes?.ok ? overviewRes.payload : null);
				setMachines(Array.isArray(machinesRes?.payload) ? machinesRes.payload : []);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [session?.key, session?.version, refreshToken]);

	useEffect(() => {
		if (!session?.key || session.key === "main") return undefined;
		var bumpRefresh = () => setRefreshToken((value) => value + 1);
		var offPresence = onEvent("presence", bumpRefresh);
		var offTelemetry = onEvent("node.telemetry", bumpRefresh);
		return () => {
			offPresence?.();
			offTelemetry?.();
		};
	}, [session?.key]);

	if (!session || session.key === "main") return null;

	var coordination = overview?.coordination || {};
	var externalActivities = Array.isArray(overview?.externalActivities) ? overview.externalActivities.slice(0, 3) : [];
	var recentSessions = Array.isArray(overview?.recentSessions) ? overview.recentSessions.slice(0, 5) : [];
	var workspaceLabel = overview?.workspaceLabel || session.workspaceLabel || session.workspace || "Unbound";
	var approvalMode = overview?.approvalMode || "smart";
	var durableNotes = overview?.memorySummary || coordination.durableNotes || "";
	var { currentMachine, preferredMachine, preferredMachineId } = resolveMachineDetails(overview, session, machines);

	return html`
		<div class="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface2)]">
			<${OverviewBadges}
				workspaceLabel=${workspaceLabel}
				currentRoute=${overview?.currentExecutionRoute || session.executionRoute}
				source=${session.externalAgentSource}
				preferredMachine=${preferredMachine}
				approvalMode=${approvalMode}
			/>

			${loading && html`<div class="text-xs text-[var(--muted)] mb-3">Loading workspace overview…</div>`}

			<div class="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
				<${MachinePostureSection} machine=${currentMachine} approvalMode=${approvalMode} />
				<${AvailableMachinesSection}
					machines=${machines}
					currentMachineId=${currentMachine?.id || null}
					preferredMachineId=${preferredMachineId}
				/>
				<${CoordinationSection} coordination=${coordination} />
				<${DurableNotesSection} durableNotes=${durableNotes} />
				<${ExternalActivitiesSection} activities=${externalActivities} />
				<${RecentSessionsSection} sessions=${recentSessions} />
			</div>
		</div>
	`;
}
