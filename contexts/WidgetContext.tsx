import * as React from "react";
import { createContext, useCallback, useContext } from "react";
// Note: @bacons/apple-targets is not installed, so widget functionality is disabled
// import { ExtensionStorage } from "@bacons/apple-targets";

// Initialize storage with your group ID
// const storage = new ExtensionStorage(
//   "group.com.<user_name>.<app_name>"
// );

type WidgetContextType = {
  refreshWidget: () => void;
};

const WidgetContext = createContext<WidgetContextType | null>(null);

export function WidgetProvider({ children }: { children: React.ReactNode }) {
  // Update widget state whenever what we want to show changes
  React.useEffect(() => {
    // Widget functionality is disabled until @bacons/apple-targets is installed
    // set widget_state to null if we want to reset the widget
    // storage.set("widget_state", null);

    // Refresh widget
    // ExtensionStorage.reloadWidget();
  }, []);

  const refreshWidget = useCallback(() => {
    // Widget functionality is disabled until @bacons/apple-targets is installed
    // ExtensionStorage.reloadWidget();
    console.log('Widget refresh requested (functionality disabled)');
  }, []);

  return (
    <WidgetContext.Provider value={{ refreshWidget }}>
      {children}
    </WidgetContext.Provider>
  );
}

export const useWidget = () => {
  const context = useContext(WidgetContext);
  if (!context) {
    throw new Error("useWidget must be used within a WidgetProvider");
  }
  return context;
};
