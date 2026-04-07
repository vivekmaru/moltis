import { html } from "htm/preact";
import { useEffect, useState } from "preact/hooks";
import { onEvent } from "../events.js";
import { localizedRpcErrorMessage, sendRpc } from "../helpers.js";
import { sessionStore } from "../stores/session-store.js";

var EXTERNAL_SOURCE_OPTIONS = ["codex", "claude_code", "copilot", "api", "imported"];

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

function machineHealthTone(machine) {
	if (machine?.health === "degraded") return "warn";
	if (machine?.available === false) return "muted";
	if (machine?.health === "ready") return "accent";
	return "default";
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

function cloneWorkspaceOverview(overview) {
	if (!overview) return null;
	return {
		...overview,
		externalActivities: Array.isArray(overview.externalActivities) ? [...overview.externalActivities] : [],
		externalActivitySummary: {
			...(overview.externalActivitySummary || {}),
			sources: { ...(overview.externalActivitySummary?.sources || {}) },
		},
		recentSessions: Array.isArray(overview.recentSessions) ? [...overview.recentSessions] : [],
		coordination: { ...(overview.coordination || {}) },
		linkedProject: overview.linkedProject
			? {
					...overview.linkedProject,
					preferredMachine: overview.linkedProject.preferredMachine
						? { ...overview.linkedProject.preferredMachine }
						: null,
				}
			: null,
		machine: overview.machine ? { ...overview.machine } : null,
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

function ExternalActivitiesSection({ activities, summaryCounts = {}, sessionKey = "", onAttached = null }) {
	var [showAttachForm, setShowAttachForm] = useState(false);
	var [source, setSource] = useState("codex");
	var [title, setTitle] = useState("");
	var [summary, setSummary] = useState("");
	var [link, setLink] = useState("");
	var [importedSessionKey, setImportedSessionKey] = useState("");
	var [importedMessageCount, setImportedMessageCount] = useState("");
	var [currentPlan, setCurrentPlan] = useState("");
	var [nextAction, setNextAction] = useState("");
	var [durableNotes, setDurableNotes] = useState("");
	var [saving, setSaving] = useState(false);
	var [error, setError] = useState("");

	useEffect(() => {
		setShowAttachForm(false);
		setSource("codex");
		setTitle("");
		setSummary("");
		setLink("");
		setImportedSessionKey("");
		setImportedMessageCount("");
		setCurrentPlan("");
		setNextAction("");
		setDurableNotes("");
		setSaving(false);
		setError("");
	}, [sessionKey]);

	function resetForm() {
		setSource("codex");
		setTitle("");
		setSummary("");
		setLink("");
		setImportedSessionKey("");
		setImportedMessageCount("");
		setCurrentPlan("");
		setNextAction("");
		setDurableNotes("");
		setError("");
	}

	function sourceCountBadges() {
		return Object.entries(summaryCounts)
			.filter(([, count]) => count > 0)
			.map(
				([itemSource, count]) => html`
				<${InventoryBadge} tone="muted">${sourceLabel(itemSource)}: ${count}</${InventoryBadge}>
			`,
			);
	}

	function attachRequestPayload(trimmedSummary) {
		var parsedImportedMessageCount = Number.parseInt(importedMessageCount, 10);
		var payload = {
			key: sessionKey,
			source: source,
			summary: trimmedSummary,
		};
		if (title.trim()) payload.title = title.trim();
		if (link.trim()) payload.link = link.trim();
		if (importedSessionKey.trim()) payload.importedSessionKey = importedSessionKey.trim();
		if (importedMessageCount.trim() && Number.isFinite(parsedImportedMessageCount)) {
			payload.importedMessageCount = parsedImportedMessageCount;
		}
		if (currentPlan.trim()) payload.currentPlan = currentPlan.trim();
		if (nextAction.trim()) payload.nextAction = nextAction.trim();
		if (durableNotes.trim()) payload.durableNotes = durableNotes.trim();
		return payload;
	}

	async function submitAttach(event) {
		event?.preventDefault?.();
		if (!sessionKey || saving) return;
		var attachSessionKey = sessionKey;
		var trimmedSummary = summary.trim();
		if (!trimmedSummary) {
			setError("Summary is required.");
			return;
		}
		setSaving(true);
		setError("");
		var result = await sendRpc("sessions.external.attach", attachRequestPayload(trimmedSummary));
		if (sessionStore.activeSessionKey.value !== attachSessionKey) return;
		setSaving(false);
		if (!result?.ok) {
			setError(localizedRpcErrorMessage(result?.error));
			return;
		}
		resetForm();
		setShowAttachForm(false);
		onAttached?.(attachSessionKey, result.payload);
	}

	return html`
		<${Section} title="External Activity">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex flex-wrap gap-1.5">${sourceCountBadges()}</div>
				<button
					type="button"
					class="provider-btn provider-btn-secondary provider-btn-sm"
					disabled=${saving}
					onClick=${() => {
						setShowAttachForm((value) => !value);
						setError("");
					}}
				>
					${showAttachForm ? "Hide attach form" : "Attach external work"}
				</button>
			</div>
			${
				showAttachForm &&
				html`
					<form class="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3 flex flex-col gap-2" onSubmit=${submitAttach}>
						<label class="flex flex-col gap-1 text-xs text-[var(--muted)]">
							<span>Source</span>
							<select
								class="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
								value=${source}
								onChange=${(event) => setSource(event.target.value)}
							>
								${EXTERNAL_SOURCE_OPTIONS.map(
									(option) => html`<option value=${option}>${sourceLabel(option)}</option>`,
								)}
							</select>
						</label>
						<label class="flex flex-col gap-1 text-xs text-[var(--muted)]">
							<span>Title</span>
							<input
								type="text"
								class="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
								placeholder="Codex review summary"
								value=${title}
								onInput=${(event) => setTitle(event.target.value)}
							/>
						</label>
						<label class="flex flex-col gap-1 text-xs text-[var(--muted)]">
							<span>Summary</span>
							<textarea
								class="min-h-[88px] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
								placeholder="Summarize what happened outside the Moltis session."
								value=${summary}
								onInput=${(event) => setSummary(event.target.value)}
							></textarea>
						</label>
						<label class="flex flex-col gap-1 text-xs text-[var(--muted)]">
							<span>Link</span>
							<input
								type="url"
								class="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
								placeholder="https://github.com/..."
								value=${link}
								onInput=${(event) => setLink(event.target.value)}
							/>
						</label>
						<div class="grid gap-2 md:grid-cols-2">
							<label class="flex flex-col gap-1 text-xs text-[var(--muted)]">
								<span>Imported session key</span>
								<input
									type="text"
									class="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
									placeholder="session:abc123"
									value=${importedSessionKey}
									onInput=${(event) => setImportedSessionKey(event.target.value)}
								/>
							</label>
							<label class="flex flex-col gap-1 text-xs text-[var(--muted)]">
								<span>Imported message count</span>
								<input
									type="number"
									min="0"
									inputmode="numeric"
									class="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
									placeholder="24"
									value=${importedMessageCount}
									onInput=${(event) => setImportedMessageCount(event.target.value)}
								/>
							</label>
						</div>
						<div class="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 flex flex-col gap-2">
							<div class="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
								Coordinator update
							</div>
							<label class="flex flex-col gap-1 text-xs text-[var(--muted)]">
								<span>Current plan</span>
								<textarea
									class="min-h-[64px] rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)]"
									placeholder="Capture the plan that this external run established."
									value=${currentPlan}
									onInput=${(event) => setCurrentPlan(event.target.value)}
								></textarea>
							</label>
							<label class="flex flex-col gap-1 text-xs text-[var(--muted)]">
								<span>Next action</span>
								<input
									type="text"
									class="rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)]"
									placeholder="What should the next session do?"
									value=${nextAction}
									onInput=${(event) => setNextAction(event.target.value)}
								/>
							</label>
							<label class="flex flex-col gap-1 text-xs text-[var(--muted)]">
								<span>Durable notes</span>
								<textarea
									class="min-h-[72px] rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)]"
									placeholder="Optional durable notes to preserve with the handoff."
									value=${durableNotes}
									onInput=${(event) => setDurableNotes(event.target.value)}
								></textarea>
							</label>
						</div>
						${error && html`<div class="text-xs text-[var(--error)]">${error}</div>`}
						<div class="flex flex-wrap items-center justify-end gap-2">
							<button
								type="button"
								class="provider-btn provider-btn-secondary provider-btn-sm"
								disabled=${saving}
								onClick=${() => {
									resetForm();
									setShowAttachForm(false);
								}}
							>
								Cancel
							</button>
							<button type="submit" class="provider-btn provider-btn-sm" disabled=${saving || !summary.trim()}>
								${saving ? "Attaching..." : "Attach"}
							</button>
						</div>
					</form>
				`
			}
			${
				activities.length > 0
					? activities.map(
							(activity) => html`
								<div class="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-2.5 flex flex-col gap-1">
									<div class="flex items-center justify-between gap-2 text-xs">
										<div class="font-medium text-[var(--text)]">${activity.title || "Attached external work"}</div>
										<div class="text-[var(--muted)]">${sourceLabel(activity.source)}</div>
									</div>
									<div class="flex flex-wrap gap-1.5">
										${
											activity.importedSessionKey &&
											html`<${InventoryBadge} tone="muted">Session: ${activity.importedSessionKey}</${InventoryBadge}>`
										}
										${
											activity.importedMessageCount != null &&
											html`<${InventoryBadge} tone="muted">${activity.importedMessageCount} msgs</${InventoryBadge}>`
										}
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
										<div class="text-[var(--muted)] flex flex-wrap items-center gap-1.5">
											<${InventoryBadge} tone="muted">${routeLabel(item.executionRoute)}</${InventoryBadge}>
											<${InventoryBadge} tone="muted">${sourceLabel(item.externalAgentSource)}</${InventoryBadge}>
											${
												item.machine &&
												html`<${InventoryBadge} tone=${machineHealthTone(item.machine)}>
													${humanizeMachineField(item.machine.health || "unknown")}
												</${InventoryBadge}>`
											}
										</div>
										${
											item.machine &&
											html`<div class="text-[var(--muted)] mt-1">
												${machineLabel(item.machine)}
											</div>`
										}
										${
											item.machine?.trustState &&
											html`<div class="text-[var(--muted)]">
												${humanizeMachineField(item.machine.trustState)}
											</div>`
										}
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
				setOverview(overviewRes?.ok ? cloneWorkspaceOverview(overviewRes.payload) : null);
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
	var externalActivitySummary = overview?.externalActivitySummary?.sources || {};

	function handleExternalAttached(attachedSessionKey, payload) {
		var targetSession = sessionStore.getByKey(attachedSessionKey);
		if (payload?.activity?.source && targetSession) {
			targetSession.externalAgentSource = payload.activity.source;
			targetSession.dataVersion.value++;
			sessionStore.notify();
		}
		if (sessionStore.activeSessionKey.value !== attachedSessionKey) return;
		if (payload?.workspaceOverview) {
			setOverview(cloneWorkspaceOverview(payload.workspaceOverview));
			return;
		}
		setRefreshToken((value) => value + 1);
	}

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
				<${ExternalActivitiesSection}
					activities=${externalActivities}
					summaryCounts=${externalActivitySummary}
					sessionKey=${session.key}
					onAttached=${handleExternalAttached}
				/>
				<${RecentSessionsSection} sessions=${recentSessions} />
			</div>
		</div>
	`;
}
