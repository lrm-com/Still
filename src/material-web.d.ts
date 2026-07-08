import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "*.ico" {
  const src: string;
  export default src;
}

type MaterialElementProps<T> = DetailedHTMLProps<HTMLAttributes<T>, T> & {
  class?: string;
};

declare module "react/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "md-switch": MaterialElementProps<HTMLElement> & {
        selected?: boolean;
        icons?: boolean;
        disabled?: boolean;
      };
      "md-slider": MaterialElementProps<HTMLElement> & {
        min?: number;
        max?: number;
        step?: number;
        value?: number;
        "value-label"?: string;
        labeled?: boolean;
        disabled?: boolean;
      };
      "md-checkbox": MaterialElementProps<HTMLElement> & {
        checked?: boolean;
        indeterminate?: boolean;
        disabled?: boolean;
        "touch-target"?: "wrapper" | "none";
      };
    }
  }
}
