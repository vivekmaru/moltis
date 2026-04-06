// ── SessionHeader Preact component ───────────────────────────
//
// Replaces the imperative updateChatSessionHeader() with a reactive
// Preact component reading sessionStore.activeSession.

import { html } from "htm/preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { onEvent } from "../events.js";
import * as gon from "../gon.js";
import { parseAgentsListPayload, sendRpc } from "../helpers.js";
import { restoreMachineSelection } from "../machine-selector.js";
import { updateSandboxUI } from "../sandbox.js";
import {
	clearActiveSession,
	fetchSessions,
	setSessionActiveRunId,
	setSessionReplying,
	switchSession,
} from "../sessions.js";
import { sessionStore } from "../stores/session-store.js";
import { ComboSelect, confirmDialog, shareLinkDialog, shareVisibilityDialog, showToast } from "../ui.js";

function executionRouteLabel(route) {
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

function externalSourceLabel(source) {
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

function buildAgentPickerState(agentOptions, agentSelectValue, defaultAgentId, switchingAgent, agentOptionsLoaded) {
	var hasCurrentAgentOption = agentOptions.some((agent) => agent.id === agentSelectValue);
	var options = agentOptions.map((agent) => {
		var prefix = agent.emoji ? `${agent.emoji} ` : "";
		var suffix = agent.id === defaultAgentId ? " (default)" : "";
		return {
			value: agent.id,
			label: `${prefix}${agent.name}${suffix}`,
		};
	});
	if (!hasCurrentAgentOption && agentSelectValue && (switchingAgent || agentOptionsLoaded)) {
		options = [
			{
				value: agentSelectValue,
				label: switchingAgent ? "Switching…" : `agent:${agentSelectValue}`,
			},
			...options,
		];
	}
	return {
		hasCurrentAgentOption,
		options,
		disabled: switchingAgent || options.length === 0,
	};
}

function machineOptionLabel(machine) {
	if (!machine) return "Local host";
	return machine.label || machine.id || "Local host";
}

function selectableNonLocalMachines(machineOptions) {
	return (machineOptions || []).filter(
		(machine) => machine?.id && machine.id !== "local" && machine.available !== false,
	);
}

function buildMachinePickerState(machineOptions, currentMachineId, switchingMachine) {
	var selectableMachines = selectableNonLocalMachines(machineOptions);
	var hasCurrentMachineOption =
		currentMachineId === "local" || selectableMachines.some((machine) => machine.id === currentMachineId);
	var options = [
		{ value: "local", label: "Local host" },
		...selectableMachines.map((machine) => ({
			value: machine.id,
			label: machineOptionLabel(machine),
		})),
	];
	if (!hasCurrentMachineOption && currentMachineId) {
		options = [
			{
				value: currentMachineId,
				label: switchingMachine ? "Switching…" : currentMachineId,
			},
			...options,
		];
	}
	return { hasCurrentMachineOption, options };
}

function renderSessionBadges(session, workspaceLabel, routeLabel, sourceLabel) {
	if (!session) return null;
	return html`
		<div class="flex flex-wrap items-center gap-1.5">
			${
				workspaceLabel &&
				html`<span class="text-[11px] rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--muted)]">
					${workspaceLabel}
				</span>`
			}
			<span class="text-[11px] rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--muted)]">
				${routeLabel}
			</span>
			<span class="text-[11px] rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--muted)]">
				${sourceLabel}
			</span>
		</div>
	`;
}

function renderNameControl({
	showName,
	renaming,
	inputRef,
	renameInputStyle,
	commitRename,
	onKeyDown,
	nameStyle,
	canRename,
	startRename,
	displayName,
}) {
	if (!showName) return null;
	if (renaming) {
		return html`<input
			ref=${inputRef}
			class="chat-session-rename-input"
			style=${renameInputStyle}
			onBlur=${commitRename}
			onKeyDown=${onKeyDown}
		/>`;
	}
	return html`<span
		class="chat-session-name"
		style=${nameStyle}
		title=${canRename ? "Click to rename" : ""}
		onClick=${startRename}
	>${displayName}</span>`;
}

function renderRenameButton(showName, showRenameButton, canRename, renaming, actionButtonClass, startRename) {
	if (!(showName && showRenameButton && canRename && !renaming)) return null;
	return html`<button class=${actionButtonClass} onClick=${startRename} title="Rename session">Rename</button>`;
}

function renderActionButton(shouldShow, content) {
	return shouldShow ? content : null;
}

function buildNameStyle(nameOwnLine, canRename) {
	var nameStyle = { cursor: canRename ? "pointer" : "default" };
	if (nameOwnLine) {
		nameStyle.color = "var(--text-strong)";
		nameStyle.wordBreak = "break-word";
	}
	return nameStyle;
}

function renderSessionNameBlock(nameOwnLine, showName, nameControl, sessionBadges, renameCta) {
	if (!(nameOwnLine && showName)) return null;
	return html`<div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 w-full">
		<div class="min-w-0 flex flex-col gap-1">
			${nameControl}
			${sessionBadges}
		</div>
		<div class="justify-self-end">${renameCta}</div>
	</div>`;
}

function renderInlineNameBlock(nameOwnLine, showName, nameControl, sessionBadges) {
	if (nameOwnLine || !showName) return null;
	return html`<div class="flex flex-col gap-1">
		${nameControl}
		${sessionBadges}
	</div>`;
}

function renderSessionSelectors({
	showSelectors,
	shouldShowAgentPicker,
	agentPicker,
	agentSelectValue,
	onAgentChange,
	shouldShowNodePicker,
	nodePicker,
	currentNodeId,
	onNodeChange,
	switchingNode,
}) {
	if (!showSelectors) return null;
	return html`
		${
			shouldShowAgentPicker &&
			html`
				<${ComboSelect}
					options=${agentPicker.options}
					value=${agentSelectValue}
					onChange=${onAgentChange}
					placeholder="Session agent"
					searchable=${false}
					allowEmpty=${false}
					fullWidth=${false}
					disabled=${agentPicker.disabled}
				/>
			`
		}
		${
			shouldShowNodePicker &&
			html`
				<${ComboSelect}
					options=${nodePicker.options}
					value=${currentNodeId}
					onChange=${onNodeChange}
					placeholder="Session machine"
					searchable=${false}
					allowEmpty=${false}
					fullWidth=${false}
					disabled=${switchingNode}
				/>
			`
		}
	`;
}

function renderSessionActions({
	showDelete,
	isMain,
	actionButtonClass,
	onDelete,
	showFork,
	isCron,
	onFork,
	showShare,
	onShare,
	showStop,
	canStop,
	onStop,
	stopping,
	showClear,
	onClear,
	clearing,
}) {
	return html`
		${renderActionButton(
			showDelete && !isMain,
			html`
				<button
					class=${`${actionButtonClass} chat-session-btn-danger inline-flex items-center gap-1.5`}
					onClick=${onDelete}
					title="Delete session"
					style=${{ background: "var(--error)", borderColor: "var(--error)", color: "#fff" }}
				>
					<span class="icon icon-sm icon-x-circle shrink-0"></span>
					Delete
				</button>
			`,
		)}
		${renderActionButton(
			showFork && !isCron,
			html`
				<button class=${`${actionButtonClass} inline-flex items-center gap-1.5`} onClick=${onFork} title="Fork session">
					<span class="icon icon-sm icon-layers shrink-0"></span>
					Fork
				</button>
			`,
		)}
		${renderActionButton(
			showShare && !isCron,
			html`
				<button class=${`${actionButtonClass} inline-flex items-center gap-1.5`} onClick=${onShare} title="Share snapshot">
					<span class="icon icon-sm icon-share shrink-0"></span>
					Share
				</button>
			`,
		)}
		${renderActionButton(
			showStop && canStop,
			html`
				<button class=${actionButtonClass} onClick=${onStop} title="Stop generation" disabled=${stopping}>
					${stopping ? "Stopping\u2026" : "Stop"}
				</button>
			`,
		)}
		${renderActionButton(
			showClear && isMain,
			html`
				<button class=${actionButtonClass} onClick=${onClear} title="Clear session" disabled=${clearing}>
					${clearing ? "Clearing\u2026" : "Clear"}
				</button>
			`,
		)}
	`;
}

function renderSessionHeaderLayout({
	nameOwnLine,
	showName,
	nameControl,
	sessionBadges,
	renameCta,
	showSelectors,
	shouldShowAgentPicker,
	agentPicker,
	agentSelectValue,
	onAgentChange,
	shouldShowNodePicker,
	nodePicker,
	currentNodeId,
	onNodeChange,
	switchingNode,
	showDelete,
	isMain,
	actionButtonClass,
	onDelete,
	showFork,
	isCron,
	onFork,
	showShare,
	onShare,
	showStop,
	canStop,
	onStop,
	stopping,
	showClear,
	onClear,
	clearing,
}) {
	return html`
		<div class=${nameOwnLine ? "flex flex-col gap-2 w-full" : "flex items-center gap-2"}>
			${renderSessionNameBlock(nameOwnLine, showName, nameControl, sessionBadges, renameCta)}
			<div class=${nameOwnLine ? "flex flex-wrap items-center gap-2" : "flex items-center gap-2"}>
				${renderSessionSelectors({
					showSelectors,
					shouldShowAgentPicker,
					agentPicker,
					agentSelectValue,
					onAgentChange,
					shouldShowNodePicker,
					nodePicker,
					currentNodeId,
					onNodeChange,
					switchingNode,
				})}
				${renderInlineNameBlock(nameOwnLine, showName, nameControl, sessionBadges)}
				${!nameOwnLine && renameCta}
				${renderSessionActions({
					showDelete,
					isMain,
					actionButtonClass,
					onDelete,
					showFork,
					isCron,
					onFork,
					showShare,
					onShare,
					showStop,
					canStop,
					onStop,
					stopping,
					showClear,
					onClear,
					clearing,
				})}
			</div>
		</div>
	`;
}

function nextSessionKey(currentKey) {
	var allSessions = sessionStore.sessions.value;
	var s = allSessions.find((x) => x.key === currentKey);
	if (s?.parentSessionKey) return s.parentSessionKey;
	var idx = allSessions.findIndex((x) => x.key === currentKey);
	if (idx >= 0 && idx + 1 < allSessions.length) return allSessions[idx + 1].key;
	if (idx > 0) return allSessions[idx - 1].key;
	return "main";
}

function buildShareUrl(payload) {
	var url = `${window.location.origin}${payload.path}`;
	if (payload.accessKey) {
		url += `?k=${encodeURIComponent(payload.accessKey)}`;
	}
	return url;
}

async function copyShareUrl(url, visibility) {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(url);
			showToast("Share link copied", "success");
			return;
		}
	} catch (_err) {
		// Clipboard APIs can fail on some browsers/permissions.
	}
	await shareLinkDialog(url, visibility);
}

function loadAgentOptions(setDefaultAgentId, setAgentOptions, setAgentOptionsLoaded, isCancelled) {
	sendRpc("agents.list", {}).then((res) => {
		if (isCancelled()) return;
		if (!res?.ok) {
			setAgentOptionsLoaded(true);
			return;
		}
		var parsed = parseAgentsListPayload(res.payload);
		setDefaultAgentId(parsed.defaultId);
		setAgentOptions(parsed.agents);
		setAgentOptionsLoaded(true);
	});
}

function refreshMachineOptions(setMachineOptions, isCancelled) {
	sendRpc("machines.list", {}).then((res) => {
		if (isCancelled() || !res?.ok) return;
		setMachineOptions(Array.isArray(res.payload) ? res.payload : []);
	});
}

function beginRename(canRename, setRenaming, inputRef, fullName) {
	if (!canRename) return;
	setRenaming(true);
	requestAnimationFrame(() => {
		if (!inputRef.current) return;
		inputRef.current.value = fullName;
		inputRef.current.focus();
		inputRef.current.select();
	});
}

function commitSessionRename(inputRef, setRenaming, fullName, currentKey) {
	var value = inputRef.current?.value.trim() || "";
	setRenaming(false);
	if (!value || value === fullName) return;
	sendRpc("sessions.patch", { key: currentKey, label: value }).then((res) => {
		if (res?.ok) fetchSessions();
	});
}

function handleRenameKeyPress(e, commitRename, setRenaming) {
	if (e.key === "Enter" && !e.isComposing) {
		e.preventDefault();
		commitRename();
	}
	if (e.key === "Escape") {
		setRenaming(false);
	}
}

function forkSession(currentKey) {
	sendRpc("sessions.fork", { key: currentKey }).then((res) => {
		if (!(res?.ok && res.payload?.sessionKey)) return;
		fetchSessions();
		switchSession(res.payload.sessionKey);
	});
}

function deleteSessionRpc(currentKey, nextKey, force = false) {
	sendRpc("sessions.delete", { key: currentKey, force: force || undefined }).then((res) => {
		if (res && !res.ok && res.error && res.error.indexOf("uncommitted changes") !== -1 && !force) {
			confirmDialog("Worktree has uncommitted changes. Force delete?").then((yes) => {
				if (!yes) return;
				deleteSessionRpc(currentKey, nextKey, true);
			});
			return;
		}
		switchSession(nextKey);
		fetchSessions();
	});
}

function maybeDeleteSession(onBeforeDelete, currentKey, session) {
	if (typeof onBeforeDelete === "function") {
		onBeforeDelete();
	}
	var msgCount = session ? session.messageCount || 0 : 0;
	var nextKey = nextSessionKey(currentKey);
	var isUnmodifiedFork = session && session.forkPoint != null && msgCount <= session.forkPoint;
	if (msgCount > 0 && !isUnmodifiedFork) {
		confirmDialog("Delete this session?").then((yes) => {
			if (yes) deleteSessionRpc(currentKey, nextKey);
		});
		return;
	}
	deleteSessionRpc(currentKey, nextKey);
}

function clearSession(clearing, setClearing) {
	if (clearing) return;
	setClearing(true);
	clearActiveSession().finally(() => {
		setClearing(false);
	});
}

function stopSession(stopping, setStopping, currentKey, activeRunId) {
	if (stopping) return;
	var params = { sessionKey: currentKey };
	if (activeRunId) params.runId = activeRunId;
	setStopping(true);
	sendRpc("chat.abort", params)
		.then((res) => {
			if (!res?.ok) {
				showToast(res?.error?.message || "Failed to stop response", "error");
				return;
			}
			setSessionActiveRunId(currentKey, null);
			setSessionReplying(currentKey, false);
		})
		.finally(() => {
			setStopping(false);
		});
}

async function shareSessionSnapshot(currentKey, visibility) {
	var res = await sendRpc("sessions.share.create", { key: currentKey, visibility: visibility });
	if (!(res?.ok && res.payload?.path)) {
		showToast(res?.error?.message || "Failed to create share link", "error");
		return;
	}

	var url = buildShareUrl(res.payload);
	await copyShareUrl(url, visibility);

	if (visibility === "private") {
		showToast("Private link includes a key, share it only with trusted people", "success");
	}

	switchSession(currentKey);
	fetchSessions();
}

function startShareFlow(onBeforeShare, shareSnapshot) {
	if (typeof onBeforeShare === "function") {
		onBeforeShare();
	}
	shareVisibilityDialog().then((visibility) => {
		if (!visibility) return;
		void shareSnapshot(visibility);
	});
}

function switchSessionAgent(nextAgentId, currentAgentId, switchingAgent, setSwitchingAgent, currentKey, session) {
	if (!nextAgentId || nextAgentId === currentAgentId || switchingAgent) {
		return;
	}
	setSwitchingAgent(true);
	sendRpc("agents.set_session", {
		session_key: currentKey,
		agent_id: nextAgentId,
	})
		.then((res) => {
			if (!res?.ok) {
				showToast(res?.error?.message || "Failed to switch agent", "error");
				return;
			}
			if (session) {
				session.agent_id = nextAgentId;
				session.dataVersion.value++;
			}
			fetchSessions();
		})
		.finally(() => {
			setSwitchingAgent(false);
		});
}

function switchSessionMachine(
	nextMachineId,
	currentMachineId,
	switchingMachine,
	setSwitchingMachine,
	currentKey,
	session,
) {
	if (switchingMachine) return;
	var targetMachineId = nextMachineId || "local";
	if (targetMachineId === currentMachineId) return;
	setSwitchingMachine(true);
	sendRpc("machines.set_session", {
		session_key: currentKey,
		machineId: targetMachineId,
	})
		.then((res) => {
			if (!res?.ok) {
				showToast(res?.error?.message || "Failed to switch machine", "error");
				return;
			}
			if (session) {
				session.machine = res.payload?.machine || session.machine || null;
				session.node_id = res.payload?.node_id || null;
				session.sandbox_enabled = res.payload?.sandbox_enabled;
				session.executionRoute =
					res.payload?.executionRoute || res.payload?.machine?.executionRoute || res.payload?.machine?.route || "local";
				session.dataVersion.value++;
			}
			updateSandboxUI(
				(res.payload?.executionRoute || res.payload?.machine?.executionRoute || res.payload?.machine?.route) ===
					"sandbox",
			);
			restoreMachineSelection(res.payload?.machine?.id || targetMachineId);
			fetchSessions();
		})
		.finally(() => {
			setSwitchingMachine(false);
		});
}

function getInitialAgentState(gonAgentsPayload) {
	return {
		initialAgentOptions: Array.isArray(gonAgentsPayload?.agents) ? gonAgentsPayload.agents : [],
		initialDefaultAgentId: typeof gonAgentsPayload?.defaultId === "string" ? gonAgentsPayload.defaultId : "main",
	};
}

function getSessionHeaderDisplay(session, currentKey, nameOwnLine, defaultAgentId) {
	var fullName = session ? session.label || session.key : currentKey;
	return {
		fullName,
		displayName: nameOwnLine ? fullName : fullName.length > 20 ? `${fullName.slice(0, 20)}\u2026` : fullName,
		replying: session?.replying.value,
		activeRunId: session?.activeRunId.value || null,
		currentAgentId: session?.agent_id || defaultAgentId || "main",
		currentMachineId:
			session?.machine?.id ||
			(session?.executionRoute === "sandbox" ? "sandbox" : null) ||
			(session?.executionRoute === "local" ? "local" : null) ||
			session?.node_id ||
			(session?.sandbox_enabled === true ? "sandbox" : "local"),
		workspaceLabel: session?.workspaceLabel || session?.workspace || "",
		routeLabel: executionRouteLabel(session?.executionRoute || "local"),
		sourceLabel: externalSourceLabel(session?.externalAgentSource || "native"),
	};
}

function getSessionHeaderStatus(currentKey, replying) {
	var isMain = currentKey === "main";
	var isCron = currentKey.startsWith("cron:");
	return {
		isMain,
		isCron,
		canRename: !(isMain || isCron),
		canStop: !isCron && replying,
	};
}

function showAgentPickerForSession(isCron, agentOptionsLoaded, agentOptions, agentPicker) {
	return !isCron && agentOptionsLoaded && (agentOptions.length > 1 || !agentPicker.hasCurrentAgentOption);
}

function showMachinePickerForSession(isCron, machineOptions, currentMachineId) {
	var selectableMachines = selectableNonLocalMachines(machineOptions);
	return !isCron && (selectableMachines.length > 0 || Boolean(currentMachineId && currentMachineId !== "local"));
}

export function SessionHeader({
	showSelectors = true,
	showName = true,
	showShare = true,
	showFork = true,
	showStop = true,
	showClear = true,
	showDelete = true,
	nameOwnLine = false,
	showRenameButton = false,
	actionButtonClass = "chat-session-btn",
	onBeforeShare = null,
	onBeforeDelete = null,
} = {}) {
	var session = sessionStore.activeSession.value;
	var currentKey = sessionStore.activeSessionKey.value;
	var gonAgentsPayload = parseAgentsListPayload(gon.get("agents"));
	var { initialAgentOptions, initialDefaultAgentId } = getInitialAgentState(gonAgentsPayload);

	var [renaming, setRenaming] = useState(false);
	var [clearing, setClearing] = useState(false);
	var [stopping, setStopping] = useState(false);
	var [switchingAgent, setSwitchingAgent] = useState(false);
	var [agentOptions, setAgentOptions] = useState(initialAgentOptions);
	var [defaultAgentId, setDefaultAgentId] = useState(initialDefaultAgentId);
	var [agentOptionsLoaded, setAgentOptionsLoaded] = useState(initialAgentOptions.length > 0);
	var [machineOptions, setMachineOptions] = useState([]);
	var [switchingMachine, setSwitchingMachine] = useState(false);
	var inputRef = useRef(null);

	var {
		fullName,
		displayName,
		replying,
		activeRunId,
		currentAgentId,
		currentMachineId,
		workspaceLabel,
		routeLabel,
		sourceLabel,
	} = getSessionHeaderDisplay(session, currentKey, nameOwnLine, defaultAgentId);
	var { isMain, isCron, canRename, canStop } = getSessionHeaderStatus(currentKey, replying);

	useEffect(() => {
		var cancelled = false;
		loadAgentOptions(setDefaultAgentId, setAgentOptions, setAgentOptionsLoaded, () => cancelled);
		return () => {
			cancelled = true;
		};
	}, [currentKey]);

	// Fetch execution machines and subscribe to availability updates.
	useEffect(() => {
		var cancelled = false;
		var fetchMachines = () => refreshMachineOptions(setMachineOptions, () => cancelled);
		fetchMachines();
		var unsubPresence = onEvent("presence", () => {
			if (!cancelled) fetchMachines();
		});
		var unsubTelemetry = onEvent("node.telemetry", () => {
			if (!cancelled) fetchMachines();
		});
		return () => {
			cancelled = true;
			unsubPresence();
			unsubTelemetry();
		};
	}, [currentKey]);

	var startRename = useCallback(() => {
		beginRename(canRename, setRenaming, inputRef, fullName);
	}, [canRename, fullName]);

	var commitRename = useCallback(() => {
		commitSessionRename(inputRef, setRenaming, fullName, currentKey);
	}, [currentKey, fullName]);

	var onKeyDown = useCallback(
		(e) => {
			handleRenameKeyPress(e, commitRename, setRenaming);
		},
		[commitRename],
	);

	var onFork = useCallback(() => {
		forkSession(currentKey);
	}, [currentKey]);

	var onDelete = useCallback(() => {
		maybeDeleteSession(onBeforeDelete, currentKey, session);
	}, [currentKey, onBeforeDelete, session]);

	var onClear = useCallback(() => {
		clearSession(clearing, setClearing);
	}, [clearing]);

	var onStop = useCallback(() => {
		stopSession(stopping, setStopping, currentKey, activeRunId);
	}, [activeRunId, currentKey, stopping]);

	var shareSnapshot = useCallback(
		async (visibility) => {
			await shareSessionSnapshot(currentKey, visibility);
		},
		[currentKey],
	);

	var onShare = useCallback(() => {
		startShareFlow(onBeforeShare, shareSnapshot);
	}, [onBeforeShare, shareSnapshot]);

	var onAgentChange = useCallback(
		(nextAgentId) => {
			switchSessionAgent(nextAgentId, currentAgentId, switchingAgent, setSwitchingAgent, currentKey, session);
		},
		[currentAgentId, currentKey, session, switchingAgent],
	);

	var onNodeChange = useCallback(
		(nextMachineId) => {
			switchSessionMachine(nextMachineId, currentMachineId, switchingMachine, setSwitchingMachine, currentKey, session);
		},
		[currentKey, currentMachineId, session, switchingMachine],
	);

	var agentSelectValue = currentAgentId;
	var agentPicker = buildAgentPickerState(
		agentOptions,
		agentSelectValue,
		defaultAgentId,
		switchingAgent,
		agentOptionsLoaded,
	);
	var shouldShowAgentPicker = showAgentPickerForSession(isCron, agentOptionsLoaded, agentOptions, agentPicker);
	var nodePicker = buildMachinePickerState(machineOptions, currentMachineId, switchingMachine);
	var shouldShowNodePicker = showMachinePickerForSession(isCron, machineOptions, currentMachineId);

	var nameStyle = buildNameStyle(nameOwnLine, canRename);
	var renameInputStyle = nameOwnLine ? { maxWidth: "none", width: "100%" } : undefined;
	var sessionBadges = renderSessionBadges(session, workspaceLabel, routeLabel, sourceLabel);
	var nameControl = renderNameControl({
		showName,
		renaming,
		inputRef,
		renameInputStyle,
		commitRename,
		onKeyDown,
		nameStyle,
		canRename,
		startRename,
		displayName,
	});
	var renameCta = renderRenameButton(showName, showRenameButton, canRename, renaming, actionButtonClass, startRename);

	return renderSessionHeaderLayout({
		nameOwnLine,
		showName,
		nameControl,
		sessionBadges,
		renameCta,
		showSelectors,
		shouldShowAgentPicker,
		agentPicker,
		agentSelectValue,
		onAgentChange,
		shouldShowNodePicker,
		nodePicker,
		currentNodeId: currentMachineId,
		onNodeChange,
		switchingNode: switchingMachine,
		showDelete,
		isMain,
		actionButtonClass,
		onDelete,
		showFork,
		isCron,
		onFork,
		showShare,
		onShare,
		showStop,
		canStop,
		onStop,
		stopping,
		showClear,
		onClear,
		clearing,
	});
}
