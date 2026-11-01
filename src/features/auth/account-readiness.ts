"use client";

import { createContext } from "react";

/** Personal capabilities require the account belonging to the current session. */
export const AccountReadinessContext = createContext({
  userId: null as string | null,
  ready: false,
});
