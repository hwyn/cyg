declare const chrome: any;
declare const chromeCache: any;

declare module "*.svg" {
  import * as React from "react";
  export const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
  const src: string;
  export default src;
}

declare module '*.scss' {
  const classes: { [key: string]: string };
  export default classes;
  export = classes;
}
