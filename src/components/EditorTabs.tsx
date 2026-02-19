/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * EDITOR TABS — Tabbed file support for Monaco Editor
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useCallback } from "react";
import { useFileExplorerStore, type OpenTab } from "../store/fileExplorerStore";
import { getFileIcon } from "../utils/fileIcons";

interface EditorTabsProps {
    onTabSelect: (path: string) => void;
}

export default function EditorTabs({ onTabSelect }: EditorTabsProps) {
    const openTabs = useFileExplorerStore((s) => s.openTabs);
    const activeFilePath = useFileExplorerStore((s) => s.activeFilePath);
    const closeTab = useFileExplorerStore((s) => s.closeTab);

    const handleClose = useCallback(
        (e: React.MouseEvent, path: string) => {
            e.stopPropagation();
            closeTab(path);
        },
        [closeTab]
    );

    if (openTabs.length === 0) return null;

    return (
        <div className="editor-tabs">
            {openTabs.map((tab: OpenTab) => {
                const isActive = tab.path === activeFilePath;
                const icon = getFileIcon(tab.name);
                return (
                    <div
                        key={tab.path}
                        className={`editor-tab ${isActive ? "editor-tab-active" : ""}`}
                        onClick={() => onTabSelect(tab.path)}
                        title={tab.path}
                    >
                        <span
                            className="editor-tab-icon"
                            style={{ backgroundColor: icon.bgColor, color: icon.color }}
                        >
                            {icon.label}
                        </span>
                        <span className="editor-tab-name">
                            {tab.name}
                            {tab.isDirty && <span className="editor-tab-dirty">●</span>}
                        </span>
                        <button
                            className="editor-tab-close"
                            onClick={(e) => handleClose(e, tab.path)}
                            title="Close"
                        >
                            ×
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
