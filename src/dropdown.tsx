import React, { useState, useEffect, useRef, type ReactNode } from "react";
import { useKeyboard } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { type ResolvedTheme, rgbaToHex } from "./themes";

export interface DropdownOption {
  title: string;
  value: string;
  icon?: ReactNode;
  keywords?: string[];
  label?: string;
}

export interface DropdownProps {
  id?: string;
  tooltip?: string;
  placeholder?: string;
  selectedValues?: string[];
  itemsPerPage?: number;
  options: DropdownOption[];
  onChange?: (newValue: string) => void;
  onFocus?: (value: string) => void;
  theme: ResolvedTheme;
}

const Dropdown = (props: DropdownProps) => {
  const {
    tooltip,
    onChange,
    onFocus,
    selectedValues = [],
    options,
    placeholder = "Search…",
    itemsPerPage = 10,
    theme: resolvedTheme,
  } = props;

  // Convert RGBA theme colors to hex for use in components
  const theme = {
    primary: rgbaToHex(resolvedTheme.primary),
    background: rgbaToHex(resolvedTheme.background),
    backgroundPanel: rgbaToHex(resolvedTheme.backgroundPanel),
    text: rgbaToHex(resolvedTheme.text),
    textMuted: rgbaToHex(resolvedTheme.textMuted),
  };

  const [selected, setSelected] = useState(0);
  const [offset, setOffset] = useState(0);
  const [searchText, setSearchText] = useState("");
  const inputRef = useRef<any>(null);

  const inFocus = true;

  // Filter options based on search
  const filteredOptions = options.filter((option) => {
    if (!searchText.trim()) return true;
    const needles = searchText.toLowerCase().trim().split(/\s+/);
    const searchableText = [option.title, ...(option.keywords || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return needles.every((needle) => searchableText.includes(needle));
  });

  // Get visible options for current page
  const visibleOptions = filteredOptions.slice(offset, offset + itemsPerPage);

  // Reset selected index and offset when search changes
  useEffect(() => {
    setSelected(0);
    setOffset(0);
    // Call onFocus for the first filtered item
    const firstOption = filteredOptions[0];
    if (firstOption && onFocus) {
      onFocus(firstOption.value);
    }
  }, [searchText, filteredOptions.length]);

  const move = (direction: -1 | 1) => {
    const itemCount = filteredOptions.length;
    if (itemCount === 0) return;

    if (direction === 1) {
      setSelected((prev) => {
        const nextIndex = (prev + 1) % itemCount;

        const visibleEnd = offset + itemsPerPage - 1;
        if (prev === visibleEnd && nextIndex < itemCount && nextIndex > prev) {
          setOffset(offset + 1);
        } else if (nextIndex < prev) {
          setOffset(0);
        }

        // Call onFocus with the newly focused item
        const focusedOption = filteredOptions[nextIndex];
        if (focusedOption && onFocus) {
          onFocus(focusedOption.value);
        }

        return nextIndex;
      });
    } else {
      setSelected((prev) => {
        const nextIndex = (prev - 1 + itemCount) % itemCount;

        if (nextIndex < offset) {
          setOffset(Math.max(0, nextIndex));
        } else if (nextIndex >= offset + itemsPerPage) {
          setOffset(Math.max(0, itemCount - itemsPerPage));
        }

        // Call onFocus with the newly focused item
        const focusedOption = filteredOptions[nextIndex];
        if (focusedOption && onFocus) {
          onFocus(focusedOption.value);
        }

        return nextIndex;
      });
    }
  };

  const selectItem = (itemValue: string) => {
    if (onChange) {
      onChange(itemValue);
    }
  };

  // Handle keyboard navigation
  useKeyboard((evt) => {
    if (evt.name === "up" || (evt.ctrl && evt.name === "p")) {
      move(-1);
    }
    if (evt.name === "down" || (evt.ctrl && evt.name === "n")) {
      move(1);
    }
    if (evt.name === "return") {
      const currentOption = filteredOptions[selected];
      if (currentOption) {
        selectItem(currentOption.value);
      }
    }
  });

  return (
    <box>
      <box style={{ paddingLeft: 2, paddingRight: 2 }}>
        <box style={{ paddingLeft: 1, paddingRight: 1 }}>
          <box
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <text attributes={TextAttributes.BOLD}>{tooltip}</text>
            <text fg={theme.textMuted}>esc</text>
          </box>
          <box style={{ paddingTop: 1, paddingBottom: 2 }}>
            <input
              ref={inputRef}
              onInput={(value) => setSearchText(value)}
              placeholder={placeholder}
              focused={inFocus}
              value={searchText}
              focusedBackgroundColor={theme.backgroundPanel}
              cursorColor={theme.primary}
              focusedTextColor={theme.textMuted}
            />
          </box>
        </box>
        <box style={{ paddingBottom: 1 }}>
          {visibleOptions.map((option, idx) => {
            const globalIndex = offset + idx;
            const isActive = globalIndex === selected;
            const isCurrent = selectedValues.includes(option.value);

            return (
              <box key={option.value}>
                <ItemOption
                  title={option.title}
                  icon={option.icon}
                  active={isActive}
                  current={isCurrent}
                  label={option.label}
                  theme={theme}
                  onMouseMove={() => {
                    setSelected(globalIndex);
                    if (onFocus) onFocus(option.value);
                  }}
                  onMouseDown={() => selectItem(option.value)}
                />
              </box>
            );
          })}
        </box>
      </box>
      <box
        border={false}
        style={{
          paddingRight: 2,
          paddingLeft: 3,
          paddingBottom: 1,
          paddingTop: 1,
          flexDirection: "row",
        }}
      >
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          ↵
        </text>
        <text fg={theme.textMuted}> select</text>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          {"   "}↑↓
        </text>
        <text fg={theme.textMuted}> navigate</text>
      </box>
    </box>
  );
};

interface HexTheme {
  primary: string;
  background: string;
  backgroundPanel: string;
  text: string;
  textMuted: string;
}

function ItemOption(props: {
  title: string;
  icon?: ReactNode;
  active?: boolean;
  current?: boolean;
  label?: string;
  theme: HexTheme;
  onMouseDown?: () => void;
  onMouseMove?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const { theme } = props;

  return (
    <box
      style={{
        flexDirection: "row",
        backgroundColor: props.active
          ? theme.primary
          : isHovered
            ? theme.backgroundPanel
            : undefined,
        paddingLeft: props.active ? 0 : 1,
        paddingRight: 1,
        justifyContent: "space-between",
      }}
      border={false}
      onMouseMove={() => {
        setIsHovered(true);
        if (props.onMouseMove) props.onMouseMove();
      }}
      onMouseOut={() => setIsHovered(false)}
      onMouseDown={props.onMouseDown}
    >
      <box style={{ flexDirection: "row" }}>
        {props.active && (
          <text fg={theme.background} selectable={false}>
            ›{""}
          </text>
        )}
        {props.icon && (
          <text
            fg={props.active ? theme.background : theme.text}
            selectable={false}
          >
            {String(props.icon)}{" "}
          </text>
        )}
        <text
          fg={
            props.active
              ? theme.background
              : props.current
                ? theme.primary
                : theme.text
          }
          attributes={props.active ? TextAttributes.BOLD : undefined}
          selectable={false}
        >
          {props.title}
        </text>
      </box>
      {props.label && (
        <text
          fg={props.active ? theme.background : theme.textMuted}
          attributes={props.active ? TextAttributes.BOLD : undefined}
          selectable={false}
        >
          {props.label}
        </text>
      )}
    </box>
  );
}

export default Dropdown;
export { Dropdown };
