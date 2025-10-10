import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useKeyboard } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { Theme } from "./theme";
import { createDescendants } from "./descendants";

const logger = console;
interface CommonProps {
  key?: any;
}

// SearchBarInterface provides the common search bar props
interface SearchBarInterface {
  isLoading?: boolean;
  filtering?: boolean | { keepSectionOrder: boolean };
  onSearchTextChange?: (text: string) => void;
  throttle?: boolean;
}

export interface DropdownProps extends SearchBarInterface, CommonProps {
  id?: string;
  tooltip?: string;
  placeholder?: string;
  storeValue?: boolean | undefined;
  value?: string;
  defaultValue?: string;
  children?: ReactNode;
  onChange?: (newValue: string) => void;
}

export interface DropdownItemProps extends CommonProps {
  title: string;
  value: string;
  icon?: ReactNode;

  keywords?: string[];
  label?: string;
}

export interface DropdownSectionProps extends CommonProps {
  title?: string;
  children?: ReactNode;
}

// Create descendants for Dropdown items - minimal fields needed
interface DropdownItemDescendant {
  value: string;
  title: string;
  hidden?: boolean;
}

const {
  DescendantsProvider: DropdownDescendantsProvider,
  useDescendants: useDropdownDescendants,
  useDescendant: useDropdownItemDescendant,
} = createDescendants<DropdownItemDescendant>();

// Context for passing data to dropdown items
interface DropdownContextValue {
  searchText: string;
  filtering?: boolean | { keepSectionOrder: boolean };
  currentSection?: string;
  selectedIndex: number;
  setSelectedIndex?: (index: number) => void;
  currentValue?: string;
  onChange?: (value: string) => void;
}

const DropdownContext = createContext<DropdownContextValue>({
  searchText: "",
  filtering: true,
  selectedIndex: 0,
});

interface DropdownType {
  (props: DropdownProps): any;
  Item: (props: DropdownItemProps) => any;
  Section: (props: DropdownSectionProps) => any;
}

const Dropdown: DropdownType = (props) => {
  const {
    tooltip,
    onChange,
    value,
    defaultValue,
    children,
    placeholder = "Search…",
    storeValue,
    isLoading,
    filtering = true,
    onSearchTextChange,
    throttle,
  } = props;

  const [selected, setSelected] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [currentValue, setCurrentValue] = useState<string | undefined>(
    value || defaultValue,
  );
  const inputRef = useRef<any>(null);
  const lastSearchTextRef = useRef("");
  const throttleTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const descendantsContext = useDropdownDescendants();

  const inFocus = true;

  // Create context value for children
  const contextValue = useMemo<DropdownContextValue>(
    () => ({
      searchText,
      filtering,
      currentSection: undefined,
      selectedIndex: selected,
      setSelectedIndex: setSelected,
      currentValue,
      onChange: (value: string) => selectItem(value),
    }),
    [searchText, filtering, selected, currentValue],
  );

  // Update controlled value
  useEffect(() => {
    if (value !== undefined) {
      setCurrentValue(value);
    }
  }, [value]);

  // Reset selected index when search changes
  useEffect(() => {
    setSelected(0);
  }, [searchText]);

  // Handle search text change with throttling
  const handleSearchTextChange = (text: string) => {
    if (!inFocus) return;

    setSearchText(text);

    if (onSearchTextChange) {
      if (throttle) {
        if (throttleTimeoutRef.current) {
          clearTimeout(throttleTimeoutRef.current);
        }
        throttleTimeoutRef.current = setTimeout(() => {
          onSearchTextChange(text);
        }, 300);
      } else {
        onSearchTextChange(text);
      }
    }
  };

  const move = (direction: -1 | 1) => {
    const items = Object.values(descendantsContext.map.current)
      .filter((item: any) => item.index !== -1)
      .sort((a: any, b: any) => a.index - b.index);

    if (items.length === 0) return;

    let next = selected + direction;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;
    setSelected(next);
  };

  const selectItem = (itemValue: string) => {
    setCurrentValue(itemValue);
    if (onChange) {
      onChange(itemValue);
    }
    if (storeValue) {
      // In a real implementation, this would persist the value
      logger.log("Storing value:", itemValue);
    }
  };

  // Handle keyboard navigation
  useKeyboard((evt) => {
    if (evt.name === "up") {
      move(-1);
    }
    if (evt.name === "down") {
      move(1);
    }
    if (evt.name === "return") {
      const items = Object.values(descendantsContext.map.current)
        .filter((item: any) => item.index !== -1)
        .sort((a: any, b: any) => a.index - b.index);

      const currentItem = items[selected];
      if (currentItem?.props) {
        selectItem((currentItem.props as DropdownItemDescendant).value);
      }
    }
  });

  return (
    <DropdownDescendantsProvider value={descendantsContext}>
      <DropdownContext.Provider value={contextValue}>
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
                <text fg={Theme.textMuted}>esc</text>
              </box>
              <box style={{ paddingTop: 1, paddingBottom: 2 }}>
                <input
                  ref={inputRef}
                  onInput={(value) => handleSearchTextChange(value)}
                  placeholder={placeholder}
                  focused={inFocus}
                  value={searchText}
                  focusedBackgroundColor={Theme.backgroundPanel}
                  cursorColor={Theme.primary}
                  focusedTextColor={Theme.textMuted}
                />
              </box>
            </box>
            <box style={{ paddingBottom: 1 }}>
              {/* Render children - they will register as descendants and render themselves */}
              {children}
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
            <text fg={Theme.text} attributes={TextAttributes.BOLD}>
              ↵
            </text>
            <text fg={Theme.textMuted}> select</text>
            <text fg={Theme.text} attributes={TextAttributes.BOLD}>
              {"   "}↑↓
            </text>
            <text fg={Theme.textMuted}> navigate</text>
          </box>
        </box>
      </DropdownContext.Provider>
    </DropdownDescendantsProvider>
  );
};

function ItemOption(props: {
  title: string;
  icon?: ReactNode;
  active?: boolean;
  current?: boolean;
  label?: string;
  onMouseDown?: () => void;
  onMouseMove?: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <box
      style={{
        flexDirection: "row",
        backgroundColor: props.active
          ? Theme.primary
          : isHovered
            ? Theme.backgroundPanel
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
          <text fg={Theme.background} selectable={false}>
            ›{""}
          </text>
        )}
        {props.icon && (
          <text
            fg={props.active ? Theme.background : Theme.text}
            selectable={false}
          >
            {String(props.icon)}{" "}
          </text>
        )}
        <text
          fg={
            props.active
              ? Theme.background
              : props.current
                ? Theme.primary
                : Theme.text
          }
          attributes={props.active ? TextAttributes.BOLD : undefined}
          selectable={false}
        >
          {props.title}
        </text>
      </box>
      {props.label && (
        <text
          fg={props.active ? Theme.background : Theme.textMuted}
          attributes={props.active ? TextAttributes.BOLD : undefined}
          selectable={false}
        >
          {props.label}
        </text>
      )}
    </box>
  );
}

const DropdownItem: (props: DropdownItemProps) => any = (props) => {
  const context = useContext(DropdownContext);
  if (!context) return null;

  const { searchText, filtering, currentSection, selectedIndex, currentValue } =
    context;

  // Apply filtering logic
  const shouldHide = (() => {
    if (!filtering || !searchText.trim()) return false;
    const needle = searchText.toLowerCase().trim();
    const searchableText = [props.title, ...(props.keywords || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return !searchableText.includes(needle);
  })();

  // Register as descendant
  const { index } = useDropdownItemDescendant({
    value: props.value,
    title: props.title,
    hidden: shouldHide,
  });

  // Don't render if hidden
  if (shouldHide) return null;

  // Determine if active (index will be -1 if hidden)
  const isActive = index === selectedIndex && index !== -1;
  const isCurrent = props.value === currentValue;

  // Handle mouse events
  const handleMouseMove = () => {
    // Update selected index on hover
    if (
      context.setSelectedIndex &&
      context.selectedIndex !== index &&
      index !== -1
    ) {
      context.setSelectedIndex(index);
    }
  };

  const handleMouseDown = () => {
    // Trigger selection on click
    if (context.onChange && props.value) {
      context.onChange(props.value);
    }
  };

  // Render the item directly
  return (
    <ItemOption
      title={props.title}
      icon={props.icon}
      active={isActive}
      current={isCurrent}
      label={props.label}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
    />
  );
};

const DropdownSection: (props: DropdownSectionProps) => any = (props) => {
  const parentContext = useContext(DropdownContext);
  if (!parentContext) return null;

  // Create new context with section title
  const sectionContextValue = useMemo(
    () => ({
      ...parentContext,
      currentSection: props.title,
    }),
    [parentContext, props.title],
  );

  return (
    <>
      {/* Render section title if provided */}
      {props.title && (
        <box style={{ paddingTop: 1, paddingLeft: 1 }}>
          <text fg={Theme.accent} attributes={TextAttributes.BOLD}>
            {props.title}
          </text>
        </box>
      )}
      {/* Render children with section context */}
      <DropdownContext.Provider value={sectionContextValue}>
        {props.children}
      </DropdownContext.Provider>
    </>
  );
};

Dropdown.Item = DropdownItem;
Dropdown.Section = DropdownSection;

export default Dropdown;
export { Dropdown };
