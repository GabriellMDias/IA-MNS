import {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
} from "react";

/**
 * Header and home-page links contributed by composed modules. Each entry is a
 * component so modules render type-checked router links to their own routes.
 */
export const ModuleNavigation = createContext<readonly ComponentType[]>([]);

export function useModuleNavigation() {
  return useContext(ModuleNavigation);
}

export type AccountMenuProps = {
  /** Only the avatar fits (collapsed sidebar rail). */
  collapsed: boolean;
  /** Shell entries (documentation, theme) rendered as menu items. */
  items: ReactNode;
  /** What to render when no signed-in person owns a menu. */
  fallback: ReactNode;
};

/**
 * Optional account menu contributed by a sign-in module. When present, the
 * product sidebar shows it instead of the module navigation links.
 */
export const AccountMenu =
  createContext<ComponentType<AccountMenuProps> | null>(null);

export function useAccountMenu() {
  return useContext(AccountMenu);
}
