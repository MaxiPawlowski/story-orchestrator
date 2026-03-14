declare module "cytoscape-dagre" {
  const register: (cy: typeof import("cytoscape").default) => void;
  export default register;
}
