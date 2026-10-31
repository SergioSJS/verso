// A menu row by its path of labels: "Organizar", "Criar foco aqui" opens
// the group, then clicks the row inside it (a file's menu is grouped).

/** Click each label in turn, in the open menu (a submenu opens by the click). */
export async function pickMenu(page, ...labels) {
  const menu = page.locator(".menu:not([hidden])");
  for (const name of labels) await menu.getByRole("menuitem", { name, exact: true }).click();
}
