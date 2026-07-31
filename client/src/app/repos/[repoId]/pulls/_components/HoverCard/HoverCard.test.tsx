import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { HoverCard } from "./HoverCard";

afterEach(cleanup);

describe("HoverCard", () => {
  it("mounts content on hover and unmounts after leaving", async () => {
    const { container } = render(
      <HoverCard trigger={<span>counts</span>}>
        <div>popover body</div>
      </HoverCard>,
    );
    const wrapper = container.firstChild as HTMLElement;

    // Closed initially — content is not mounted (so a data-fetch child won't fire).
    expect(screen.queryByText("popover body")).toBeNull();

    fireEvent.mouseEnter(wrapper);
    const body = screen.getByText("popover body");
    expect(body).toBeInTheDocument();
    // Rendered in a portal (under document.body), not inside the trigger wrapper,
    // so it escapes the table's overflow:hidden.
    expect(wrapper.contains(body)).toBe(false);

    fireEvent.mouseLeave(wrapper);
    await waitFor(() => expect(screen.queryByText("popover body")).toBeNull());
  });
});
