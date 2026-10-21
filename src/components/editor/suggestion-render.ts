import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance } from "tippy.js";
import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { SuggestionList, type SuggestionItem, type SuggestionListRef } from "./suggestion-list";

/** Shared popup renderer for slash menu and mention menu. */
export function makeSuggestionRender<I extends SuggestionItem>(
  emptyText?: string
): SuggestionOptions<I>["render"] {
  return () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let component: ReactRenderer<SuggestionListRef, any> | null = null;
    let popup: Instance[] | null = null;

    const getRect = (props: SuggestionProps<I>) =>
      (props.clientRect?.() ?? new DOMRect(0, 0, 0, 0)) as DOMRect;

    return {
      onStart: (props) => {
        const renderer = new ReactRenderer(SuggestionList, {
          props: { items: props.items, command: props.command, emptyText },
          editor: props.editor,
        });
        component = renderer;
        popup = tippy("body", {
          getReferenceClientRect: () => getRect(props),
          appendTo: () => document.body,
          content: renderer.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
          arrow: false,
          theme: "silo",
        });
      },
      onUpdate: (props) => {
        component?.updateProps({ items: props.items, command: props.command, emptyText });
        popup?.[0]?.setProps({ getReferenceClientRect: () => getRect(props) });
      },
      onKeyDown: (props) => {
        if (props.event.key === "Escape") {
          popup?.[0]?.hide();
          return true;
        }
        return component?.ref?.onKeyDown(props) ?? false;
      },
      onExit: () => {
        popup?.[0]?.destroy();
        component?.destroy();
        popup = null;
        component = null;
      },
    };
  };
}
