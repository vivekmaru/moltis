import { computed, signal } from "@preact/signals";
import { sendRpc } from "../helpers.js";

export var machines = signal([]);
export var selectedMachineId = signal(null);

export var selectedMachine = computed(() => {
	var id = selectedMachineId.value;
	if (!id) return null;
	return machines.value.find((machine) => machine.id === id) || null;
});

export function setAll(items) {
	machines.value = Array.isArray(items) ? items : [];
}

export function fetch() {
	return sendRpc("machines.list", {}).then((res) => {
		if (!res?.ok) return;
		setAll(res.payload || []);
	});
}

export function select(id) {
	selectedMachineId.value = id || null;
}

export function getById(id) {
	return machines.value.find((machine) => machine.id === id) || null;
}

export var machineStore = {
	machines,
	selectedMachineId,
	selectedMachine,
	setAll,
	fetch,
	select,
	getById,
};
