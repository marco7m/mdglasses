/// <reference types="vite/client" />

declare module "*.css" {
  const src: string;
  export default src;
}

declare module "highlight.js/styles/*.css" {
  const src: string;
  export default src;
}
