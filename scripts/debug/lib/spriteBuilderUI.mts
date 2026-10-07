export async function readBuilderError(root): Promise<string | null> {
  const errors = await root.locator(':scope > [role="alert"]').allTextContents();
  return errors.filter((text) => text.trim()).join(' ') || null;
}
