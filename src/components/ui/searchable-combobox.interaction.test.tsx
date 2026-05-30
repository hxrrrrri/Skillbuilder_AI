// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchableCombobox } from "./searchable-combobox";
import { TARGET_ROLES, CANDIDATE_LEVELS, CUSTOM_ROLE_LABEL, CUSTOM_LEVEL_LABEL, searchRoles } from "@/lib/roles";

function RoleHarness({ onValue }: { onValue: (v: string) => void }) {
  const [value, setValue] = useState("Full-stack Developer");
  return (
    <SearchableCombobox
      ariaLabel="Target role"
      options={TARGET_ROLES.map((r) => r.label)}
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue(v);
      }}
      searchable
      filter={(q) => searchRoles(q).map((r) => r.label)}
      customTriggerLabel={CUSTOM_ROLE_LABEL}
    />
  );
}

function LevelHarness({ onValue }: { onValue: (v: string) => void }) {
  const [value, setValue] = useState("Junior");
  return (
    <SearchableCombobox
      ariaLabel="Candidate level"
      options={CANDIDATE_LEVELS}
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue(v);
      }}
      searchable={false}
      customTriggerLabel={CUSTOM_LEVEL_LABEL}
    />
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("SearchableCombobox — role", () => {
  it("searches and selecting a role updates the value", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<RoleHarness onValue={onValue} />);

    await user.click(screen.getByRole("button", { name: "Target role" }));
    await user.type(screen.getByLabelText("Search options"), "react");
    await user.click(screen.getByRole("button", { name: "React Developer" }));

    expect(onValue).toHaveBeenCalledWith("React Developer");
    expect(screen.getByText("React Developer")).toBeTruthy();
  });

  it("custom value is only reachable through the Custom Role option", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<RoleHarness onValue={onValue} />);

    await user.click(screen.getByRole("button", { name: "Target role" }));
    await user.click(screen.getByRole("button", { name: /Custom Role/ }));
    // now a free-text input appears
    const custom = screen.getByPlaceholderText("Type a custom value…");
    await user.type(custom, "Game Developer");
    expect(onValue).toHaveBeenLastCalledWith("Game Developer");
  });
});

describe("SearchableCombobox — level dropdown", () => {
  it("has no search box and selecting a level updates the value", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<LevelHarness onValue={onValue} />);

    await user.click(screen.getByRole("button", { name: "Candidate level" }));
    expect(screen.queryByLabelText("Search options")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Senior" }));
    expect(onValue).toHaveBeenCalledWith("Senior");
  });
});
