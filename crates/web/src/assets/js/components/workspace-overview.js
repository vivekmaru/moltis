import { html } from "htm/preact";
import { useEffect, useState } from "preact/hooks";
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

export function WorkspaceOverview() {
	var session = sessionStore.activeSession.value;
	var [overview, setOverview] = useState(null);
	var [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!session?.key || session.key === "main") {
			setOverview(null);
			return;
		}
		var cancelled = false;
		setLoading(true);
		sendRpc("sessions.workspace_overview", { key: session.key })
			.then((res) => {
				if (cancelled) return;
				setOverview(res?.ok ? res.payload : null);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [session?.key, session?.version]);

	if (!session || session.key === "main") return null;

	var coordination = overview?.coordination || {};
	var externalActivities = Array.isArray(overview?.externalActivities) ? overview.externalActivities.slice(0, 3) : [];
	var recentSessions = Array.isArray(overview?.recentSessions) ? overview.recentSessions.slice(0, 5) : [];
	var workspaceLabel = overview?.workspaceLabel || session.workspaceLabel || session.workspace || "Unbound";
	var approvalMode = overview?.approvalMode || "smart";
	var durableNotes = overview?.memorySummary || coordination.durableNotes || "";

	return html`
		<div class="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface2)]">
			<div class="flex flex-wrap items-center gap-2 mb-3">
				<span class="inline-flex items-center rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text)]">
					Workspace: ${workspaceLabel}
				</span>
				<span class="inline-flex items-center rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text)]">
					Route: ${routeLabel(overview?.currentExecutionRoute || session.executionRoute)}
				</span>
				<span class="inline-flex items-center rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text)]">
					Source: ${sourceLabel(session.externalAgentSource)}
				</span>
				<span class="inline-flex items-center rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)]">
					Approvals: ${approvalMode}
				</span>
			</div>

			${loading && html`<div class="text-xs text-[var(--muted)] mb-3">Loading workspace overview…</div>`}

			<div class="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
				<${Section} title="Coordination Loop">
					<${KeyValue} label="Decision" value=${coordination.decision} />
					<${KeyValue} label="Current plan" value=${coordination.currentPlan} />
					<${KeyValue} label="Next action" value=${coordination.nextAction} />
					<${KeyValue} label="Route constraints" value=${coordination.routeConstraints} />
					${
						!(
							coordination.decision ||
								coordination.currentPlan ||
								coordination.nextAction ||
								coordination.routeConstraints
						) && html`<div class="text-xs text-[var(--muted)]">No coordination notes captured yet.</div>`
					}
				</${Section}>

				<${Section} title="Durable Notes">
					${
						durableNotes
							? html`<div class="text-xs leading-relaxed text-[var(--text)] whitespace-pre-wrap">${durableNotes}</div>`
							: html`<div class="text-xs text-[var(--muted)]">No durable notes saved for this workspace yet.</div>`
					}
				</${Section}>

				<${Section} title="External Activity">
					${
						externalActivities.length > 0
							? externalActivities.map(
									(activity) => html`
										<div class="rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-2.5 flex flex-col gap-1">
											<div class="flex items-center justify-between gap-2 text-xs">
												<div class="font-medium text-[var(--text)]">
													${activity.title || "Attached external work"}
												</div>
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

				<${Section} title="Recent Workspace Sessions">
					${
						recentSessions.length > 0
							? recentSessions.map(
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
			</div>
		</div>
	`;
}
