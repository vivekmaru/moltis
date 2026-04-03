// ── Session store (signal-based) ─────────────────────────────
//
// Single source of truth for session data. Each session becomes a
// Session class instance with per-session signals for client-side state.

import { computed, signal } from "@preact/signals";

// ── Session class ────────────────────────────────────────────

function assignSessionIdentityFields(target, serverData) {
	target.label = serverData.label || "";
	target.model = serverData.model || "";
	target.provider = serverData.provider || "";
	target.projectId = serverData.projectId || "";
	target.workspace = serverData.workspace || target.projectId || "";
	target.workspaceLabel = serverData.workspaceLabel || "";
	target.createdAt = serverData.createdAt || 0;
	target.worktree_branch = serverData.worktree_branch || "";
	target.parentSessionKey = serverData.parentSessionKey || "";
	target.forkPoint = serverData.forkPoint == null ? null : serverData.forkPoint;
}

function assignSessionCountFields(target, serverData, preserveCounts) {
	if (preserveCounts) {
		// Only accept server counts when they've caught up with optimistic
		// client bumps. Authoritative resets (/clear, switchSession) use
		// syncCounts() which sets messageCount directly before any fetch.
		var serverCount = serverData.messageCount || 0;
		if (serverCount >= target.messageCount) {
			target.messageCount = serverCount;
			target.lastSeenMessageCount = serverData.lastSeenMessageCount || 0;
			target.preview = serverData.preview || "";
			target.updatedAt = serverData.updatedAt || 0;
		}
	} else {
		target.messageCount = serverData.messageCount || 0;
		target.lastSeenMessageCount = serverData.lastSeenMessageCount || 0;
		target.preview = serverData.preview || "";
		target.updatedAt = serverData.updatedAt || 0;
	}
}

function assignSessionRouteFields(target, serverData) {
	target.sandbox_enabled = serverData.sandbox_enabled;
	target.sandbox_image = serverData.sandbox_image || null;
	target.channelBinding = serverData.channelBinding || null;
	target.agent_id = serverData.agent_id || "main";
	target.node_id = serverData.node_id || null;
	target.surface = serverData.surface || "web";
	target.sessionKind = serverData.sessionKind || "web";
	target.executionRoute = serverData.executionRoute || "local";
	target.machine = serverData.machine || null;
	target.externalAgentSource = serverData.externalAgentSource || "native";
}

function assignSessionStatusFields(target, serverData) {
	target.mcpDisabled = serverData.mcpDisabled;
	target.archived = serverData.archived;
	target.activeChannel = serverData.activeChannel;
}

function assignSessionFields(target, serverData, { preserveCounts = false } = {}) {
	assignSessionIdentityFields(target, serverData);
	assignSessionCountFields(target, serverData, preserveCounts);
	assignSessionRouteFields(target, serverData);
	assignSessionStatusFields(target, serverData);
}

function applySessionClientFlags(session, serverData) {
	if (serverData._localUnread) session.localUnread.value = true;
	if (serverData._replying || serverData.replying) session.replying.value = true;
	return session;
}

function hydrateSession(existingSession, serverData) {
	var session = existingSession || new Session(serverData);
	if (existingSession) {
		existingSession.update(serverData);
	}
	return applySessionClientFlags(session, serverData);
}

export class Session {
	constructor(serverData) {
		// Server fields (plain properties, set on construction/update)
		this.key = serverData.key;
		assignSessionFields(this, serverData);
		this.version = serverData.version || 0;

		// Client signals (reactive, per-session)
		this.replying = signal(false);
		this.localUnread = signal(false);
		this.streamText = signal("");
		this.voicePending = signal(false);
		this.activeRunId = signal(null);
		this.lastHistoryIndex = signal(-1);
		this.sessionTokens = signal({ input: 0, output: 0 });
		this.contextWindow = signal(0);
		this.toolsEnabled = signal(true);
		this.lastToolOutput = signal("");
		// Total message count — reactive signal that drives the sidebar badge.
		// Components read this to show/hide badge and compute unread tinting.
		this.badgeCount = signal(this.messageCount);
		// Bumped whenever plain properties change so subscribed components re-render.
		this.dataVersion = signal(0);
	}

	/** Recalculate badge from current messageCount. */
	updateBadge() {
		this.badgeCount.value = this.messageCount;
	}

	/** Merge server fields, preserving client signals. Returns false if stale. */
	update(serverData) {
		var incoming = serverData.version || 0;
		if (incoming > 0 && this.version > 0 && incoming < this.version) return false;
		this.version = incoming || this.version;
		assignSessionFields(this, serverData, { preserveCounts: true });
		this.updateBadge();
		this.dataVersion.value++;
		return true;
	}

	/** Optimistic bump: increment total and mark seen if active. */
	bumpCount(increment) {
		this.messageCount = (this.messageCount || 0) + increment;
		if (this.key === activeSessionKey.value) {
			this.lastSeenMessageCount = this.messageCount;
		}
		this.updateBadge();
	}

	/** Authoritative set (switchSession history, /clear). */
	syncCounts(messageCount, lastSeenMessageCount) {
		this.messageCount = messageCount;
		this.lastSeenMessageCount = lastSeenMessageCount;
		this.updateBadge();
	}

	/** Clear streaming state for this session. */
	resetStreamState() {
		this.streamText.value = "";
		this.voicePending.value = false;
		this.activeRunId.value = null;
		this.lastToolOutput.value = "";
	}
}

// ── Store signals ────────────────────────────────────────────
export var sessions = signal([]);
export var activeSessionKey = signal(localStorage.getItem("moltis-session") || "main");
export var switchInProgress = signal(false);
export var refreshInProgressKey = signal("");
/** Session list tab filter: "all" | "sessions" | "cron" */
export var sessionListTab = signal(localStorage.getItem("moltis-session-tab") || "sessions");

export var activeSession = computed(() => {
	var key = activeSessionKey.value;
	return sessions.value.find((s) => s.key === key) || null;
});

// ── Methods ──────────────────────────────────────────────────

/**
 * Replace the full sessions list from server data.
 * Reuses existing Session instances (matched by key) so their
 * client-side signals (replying, localUnread, streamText) are preserved.
 * New keys get fresh instances. Missing keys are dropped.
 */
export function setAll(serverSessions) {
	var existing = new Map(sessions.value.map((session) => [session.key, session]));
	sessions.value = serverSessions.map((data) => hydrateSession(existing.get(data.key), data));
}

/**
 * Upsert a single session from server data.
 * Reuses existing instance when present; creates and appends when missing.
 */
export function upsert(serverData) {
	if (!serverData?.key) return null;
	var prev = getByKey(serverData.key);
	if (prev) {
		prev.update(serverData);
		return prev;
	}
	var next = new Session(serverData);
	sessions.value = [...sessions.value, next];
	return next;
}

/** Remove a session by key. Returns true when a session was removed. */
export function remove(key) {
	if (!key) return false;
	var existing = getByKey(key);
	if (!existing) return false;
	sessions.value = sessions.value.filter((session) => session.key !== key);
	if (activeSessionKey.value === key) {
		var fallback = sessions.value.find((session) => session.key === "main")?.key || sessions.value[0]?.key || "main";
		activeSessionKey.value = fallback;
		localStorage.setItem("moltis-session", fallback);
	}
	return true;
}

/** Fetch sessions from the server via HTTP (gzip-friendly). */
export function fetch() {
	return window
		.fetch("/api/sessions", {
			headers: { Accept: "application/json" },
		})
		.then((response) => (response.ok ? response.json() : null))
		.then((payload) => {
			if (!Array.isArray(payload)) return;
			setAll(payload);
		})
		.catch(() => null);
}

/** Notify Preact that session data changed (triggers re-render). */
export function notify() {
	sessions.value = [...sessions.value];
}

/** Look up a session by key. */
export function getByKey(key) {
	return sessions.value.find((s) => s.key === key) || null;
}

/** Set the active session key. Persists to localStorage. */
export function setActive(key) {
	activeSessionKey.value = key;
	localStorage.setItem("moltis-session", key);
}

/** Set the session list tab and persist it. */
export function setSessionListTab(tab) {
	sessionListTab.value = tab;
	localStorage.setItem("moltis-session-tab", tab);
}

export var sessionStore = {
	sessions,
	activeSessionKey,
	activeSession,
	switchInProgress,
	refreshInProgressKey,
	sessionListTab,
	Session,
	setAll,
	upsert,
	remove,
	fetch,
	getByKey,
	setActive,
	setSessionListTab,
	notify,
};
