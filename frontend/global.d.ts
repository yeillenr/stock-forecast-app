// Allows side-effect imports of global CSS in Next.js + TypeScript projects
declare module "*.css";
declare module "*.scss";
declare module "*.sass";
declare module "*.less";

// CSS modules
declare module "*.module.css" {
  const classes: { [key: string]: string };
  export default classes;
}

declare module "*.module.scss" {
  const classes: { [key: string]: string };
  export default classes;
}
