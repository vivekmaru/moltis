const { expect, test } = require("../base-test");
const { navigateAndWait, waitForWsConnected, watchPageErrors } = require("../helpers");

test.describe("Machine selector", () => {
	function getMachineSelectorState(page) {
		return page.evaluate(async () => {
			const appScript = document.querySelector('script[type="module"][src*="js/app.js"]');
			if (!appScript) throw new Error("app.js module not found");
			const appUrl = new URL(appScript.src, window.location.origin);
			const prefix = appUrl.href.slice(0, appUrl.href.length - "js/app.js".length);
			const [{ machines, selectedMachine }] = await Promise.all([import(`${prefix}js/stores/machine-store.js`)]);
			const selectableCount = machines.value.filter((machine) => machine?.available !== false).length;
			return {
				selectableCount,
				selectedLabel: selectedMachine.value?.label || "Local host",
			};
		});
	}

	test("machine selector visibility matches the available machine count", async ({ page }) => {
		const pageErrors = watchPageErrors(page);
		await navigateAndWait(page, "/chats/main");
		await waitForWsConnected(page);

		const machineCombo = page.locator("#nodeCombo");
		const selectorState = await getMachineSelectorState(page);
		if (selectorState.selectableCount > 1) {
			await expect(machineCombo).toBeVisible();
		} else {
			await expect(machineCombo).toBeHidden();
		}

		expect(pageErrors).toEqual([]);
	});

	test("machine selector exists in chat toolbar DOM", async ({ page }) => {
		const pageErrors = watchPageErrors(page);
		await navigateAndWait(page, "/chats/main");
		await waitForWsConnected(page);

		const machineCombo = page.locator("#nodeCombo");
		await expect(machineCombo).toHaveCount(1);

		const machineComboBtn = page.locator("#nodeComboBtn");
		await expect(machineComboBtn).toHaveCount(1);

		const machineDropdown = page.locator("#nodeDropdown");
		await expect(machineDropdown).toHaveCount(1);
		await expect(machineDropdown).toBeHidden();

		expect(pageErrors).toEqual([]);
	});

	test("machine combo label matches the selected machine", async ({ page }) => {
		const pageErrors = watchPageErrors(page);
		await navigateAndWait(page, "/chats/main");
		await waitForWsConnected(page);

		const selectorState = await getMachineSelectorState(page);
		const label = page.locator("#nodeComboLabel");
		await expect(label).toHaveText(selectorState.selectedLabel);

		expect(pageErrors).toEqual([]);
	});

	test("machine selector renders injected ssh target distinctly", async ({ page }) => {
		const pageErrors = watchPageErrors(page);
		await navigateAndWait(page, "/chats/main");
		await waitForWsConnected(page);

		await page.evaluate(async () => {
			const appScript = document.querySelector('script[type="module"][src*="js/app.js"]');
			if (!appScript) throw new Error("app.js module not found");
			const appUrl = new URL(appScript.src, window.location.origin);
			const prefix = appUrl.href.slice(0, appUrl.href.length - "js/app.js".length);
			const [{ setAll, select }, selector, state] = await Promise.all([
				import(`${prefix}js/stores/machine-store.js`),
				import(`${prefix}js/machine-selector.js`),
				import(`${prefix}js/state.js`),
			]);

			setAll([
				{
					id: "ssh:target:42",
					label: "SSH: deploy@box",
					kind: "ssh",
					health: "degraded",
					available: true,
				},
			]);
			select("ssh:target:42");
			state.nodeCombo.classList.remove("hidden");
			selector.restoreMachineSelection("ssh:target:42");
			selector.renderMachineList();
		});

		await expect(page.locator("#nodeCombo")).toBeVisible();
		await expect(page.locator("#nodeComboLabel")).toHaveText("SSH: deploy@box");
		await page.locator("#nodeComboBtn").click();
		await expect(page.locator("#nodeDropdown")).toBeVisible();
		await expect(page.getByText("ssh · degraded", { exact: true })).toBeVisible();

		expect(pageErrors).toEqual([]);
	});
});
