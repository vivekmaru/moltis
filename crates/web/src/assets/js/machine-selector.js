import { onEvent } from "./events.js";
import { sendRpc } from "./helpers.js";
import { updateSandboxUI } from "./sandbox.js";
import { applySessionMachinePayload, resolveSessionExecutionRoute } from "./session-machine.js";
import * as S from "./state.js";
import { machineStore } from "./stores/machine-store.js";
import { sessionStore } from "./stores/session-store.js";

var machineIdx = -1;
var eventUnsubs = [];

function machineDisplayLabel(machine) {
	if (!machine) return "Local host";
	return machine.label || machine.id;
}

function machineMetaLabel(machine) {
	if (!machine) return "";
	var bits = [];
	if (machine.kind) bits.push(machine.kind.replaceAll("_", " "));
	if (machine.health && machine.health !== "ready") bits.push(machine.health.replaceAll("_", " "));
	return bits.join(" · ");
}

function isMachineSelectable(machine) {
	return machine?.available !== false;
}

function updateMachineComboLabel(machine) {
	if (S.nodeComboLabel) {
		S.nodeComboLabel.textContent = machineDisplayLabel(machine);
	}
	if (S.nodeComboBtn) {
		S.nodeComboBtn.title = `Execution machine: ${machineDisplayLabel(machine)}`;
	}
}

function syncActiveSessionMachine(machine, payload) {
	var session = sessionStore.getByKey(S.activeSessionKey);
	if (!session) return;
	applySessionMachinePayload(session, payload, machine);
	session.dataVersion.value++;
}

export function fetchMachines() {
	return machineStore.fetch().then(() => {
		var allMachines = machineStore.machines.value.filter(isMachineSelectable);
		if (S.nodeCombo) {
			if (allMachines.length > 1) {
				S.nodeCombo.classList.remove("hidden");
			} else {
				S.nodeCombo.classList.add("hidden");
			}
		}
		updateMachineComboLabel(machineStore.selectedMachine.value);
	});
}

export function selectMachine(machineId) {
	var selectedId = machineId || "local";
	var selectedMachine = machineStore.getById(selectedId);
	if (!(selectedMachine && isMachineSelectable(selectedMachine))) return;
	machineStore.select(selectedId);
	updateMachineComboLabel(selectedMachine);
	sendRpc("machines.set_session", { session_key: S.activeSessionKey, machineId: selectedId }).then((res) => {
		if (!res?.ok) return;
		var machine = res.payload?.machine || selectedMachine;
		machineStore.select(machine.id);
		updateMachineComboLabel(machine);
		syncActiveSessionMachine(machine, res.payload);
		updateSandboxUI(resolveSessionExecutionRoute(res.payload || machine) === "sandbox");
	});
	closeMachineDropdown();
}

export function openMachineDropdown() {
	if (!S.nodeDropdown) return;
	S.nodeDropdown.classList.remove("hidden");
	machineIdx = -1;
	renderMachineList();
}

export function closeMachineDropdown() {
	if (!S.nodeDropdown) return;
	S.nodeDropdown.classList.add("hidden");
	machineIdx = -1;
}

function buildMachineItem(machine, currentId) {
	var el = document.createElement("div");
	el.className = "model-dropdown-item";
	if (machine.id === currentId) el.classList.add("selected");
	if (!isMachineSelectable(machine)) el.classList.add("disabled");

	var label = document.createElement("span");
	label.className = "model-item-label";
	label.textContent = machineDisplayLabel(machine);
	el.appendChild(label);

	var metaText = machineMetaLabel(machine);
	if (metaText) {
		var meta = document.createElement("span");
		meta.className = "model-item-meta";
		var badge = document.createElement("span");
		badge.className = "model-item-provider";
		badge.textContent = metaText;
		meta.appendChild(badge);
		el.appendChild(meta);
	}

	el.addEventListener("click", () => {
		if (!isMachineSelectable(machine)) return;
		selectMachine(machine.id);
	});
	return el;
}

export function renderMachineList() {
	if (!S.nodeDropdownList) return;
	S.nodeDropdownList.textContent = "";
	var currentId = machineStore.selectedMachineId.value;
	for (var machine of machineStore.machines.value) {
		S.nodeDropdownList.appendChild(buildMachineItem(machine, currentId));
	}
}

function updateMachineActive() {
	if (!S.nodeDropdownList) return;
	var items = S.nodeDropdownList.querySelectorAll(".model-dropdown-item");
	items.forEach((el, i) => {
		el.classList.toggle("kb-active", i === machineIdx);
	});
	if (machineIdx >= 0 && items[machineIdx]) {
		items[machineIdx].scrollIntoView({ block: "nearest" });
	}
}

export function bindMachineComboEvents() {
	if (!(S.nodeComboBtn && S.nodeDropdownList && S.nodeCombo && S.nodeDropdown)) return;

	S.nodeComboBtn.addEventListener("click", () => {
		if (S.nodeDropdown.classList.contains("hidden")) {
			openMachineDropdown();
		} else {
			closeMachineDropdown();
		}
	});

	S.nodeDropdown.addEventListener("keydown", (e) => {
		var items = S.nodeDropdownList.querySelectorAll(".model-dropdown-item");
		if (e.key === "ArrowDown") {
			e.preventDefault();
			machineIdx = Math.min(machineIdx + 1, items.length - 1);
			updateMachineActive();
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			machineIdx = Math.max(machineIdx - 1, 0);
			updateMachineActive();
		} else if (e.key === "Enter") {
			e.preventDefault();
			if (machineIdx >= 0 && items[machineIdx]) items[machineIdx].click();
		} else if (e.key === "Escape") {
			closeMachineDropdown();
			if (S.nodeComboBtn) S.nodeComboBtn.focus();
		}
	});

	eventUnsubs.push(onEvent("presence", () => fetchMachines()));
	eventUnsubs.push(onEvent("node.telemetry", () => fetchMachines()));
}

export function unbindMachineEvents() {
	for (var unsub of eventUnsubs) unsub();
	eventUnsubs = [];
}

document.addEventListener("click", (e) => {
	if (S.nodeCombo && !S.nodeCombo.contains(e.target)) {
		closeMachineDropdown();
	}
});

export function restoreMachineSelection(machineId) {
	var resolvedId = machineId || "local";
	machineStore.select(resolvedId);
	updateMachineComboLabel(machineStore.getById(resolvedId));
}
