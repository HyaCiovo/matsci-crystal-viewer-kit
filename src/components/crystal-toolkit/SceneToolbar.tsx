import React from 'react';
import { Camera, Cog, Download, Maximize, Minimize, Undo2 } from 'lucide-react';
import { ButtonBar } from '../data-display/ButtonBar';
import { Dropdown } from '../navigation/Dropdown';
import { Tooltip } from '../data-display/Tooltip';
import Scene from './scene/Scene';
import { ExportType } from './scene/constants';
import type { CrystalToolkitSceneTexts } from './sceneControlTexts';
import { requestSceneExport, type SceneExportFileNames } from './sceneExport';
import { hideTooltip } from './sceneComponentUtils';

type SetProps = (value: any) => any;

export interface SceneToolbarProps {
  expanded: boolean;
  onToggleExpanded: () => void;
  hasSettingsPanel: boolean;
  showSettingsPanel: boolean;
  onToggleSettingsPanel: () => void;
  settingsTriggerRef?: React.Ref<HTMLButtonElement>;
  onResetCamera: () => void;
  sceneRef: React.RefObject<Scene | null>;
  setProps: SetProps;
  tooltipId: string;
  texts: CrystalToolkitSceneTexts;
  fileOptions?: string[];
  exportFilePrefix?: string;
  exportFileNames?: SceneExportFileNames;
  showExpandButton?: boolean;
  showImageButton?: boolean;
  showExportButton?: boolean;
  showPositionButton?: boolean;
}

export function SceneToolbar({
  expanded,
  onToggleExpanded,
  hasSettingsPanel,
  showSettingsPanel,
  onToggleSettingsPanel,
  settingsTriggerRef,
  onResetCamera,
  sceneRef,
  setProps,
  tooltipId,
  texts,
  fileOptions,
  exportFilePrefix,
  exportFileNames,
  showExpandButton = true,
  showImageButton = true,
  showExportButton = true,
  showPositionButton = true
}: SceneToolbarProps) {
  return (
    <ButtonBar>
      {showExpandButton && (
        <Tooltip
          place="left"
          trigger={
            <button
              className="ms-button"
              onClick={() => {
                hideTooltip();
                onToggleExpanded();
              }}
            >
              {expanded ? <Minimize /> : <Maximize />}
            </button>
          }
        >
          {expanded ? texts.exitFullScreen : texts.enterFullScreen}
        </Tooltip>
      )}
      {hasSettingsPanel && (
        <Tooltip
          place="left"
          trigger={
            <button
              data-tooltip-id={`settings-${tooltipId}`}
              className="ms-button"
              ref={settingsTriggerRef}
              onClick={onToggleSettingsPanel}
            >
              <Cog />
            </button>
          }
        >
          {showSettingsPanel ? texts.hideSettings : texts.showSettings}
        </Tooltip>
      )}
      {showPositionButton && (
        <Tooltip
          place="left"
          trigger={
            <button className="ms-button" onClick={onResetCamera}>
              <Undo2 />
            </button>
          }
        >
          {texts.returnToOriginalPosition}
        </Tooltip>
      )}
      {showImageButton && (
        <Tooltip
          place="left"
          trigger={
            <div onClick={() => hideTooltip()}>
              <Dropdown triggerIcon={<Camera />} isArrowless isRight>
                <p
                  key="image-export-png"
                  className="ms-dropdown-item"
                  onClick={() => {
                    requestSceneExport(ExportType.png, sceneRef.current!, setProps, {
                      exportFilePrefix,
                      exportFileNames
                    });
                  }}
                >
                  {texts.screenshotPng}
                </p>
                <p
                  key="image-export-gltf"
                  className="ms-dropdown-item"
                  onClick={() => {
                    requestSceneExport(ExportType.gltf, sceneRef.current!, setProps, {
                      exportFilePrefix,
                      exportFileNames
                    });
                  }}
                >
                  {texts.modelGltf}
                </p>
                <p
                  key="image-export-glb"
                  className="ms-dropdown-item"
                  onClick={() => {
                    requestSceneExport(ExportType.glb, sceneRef.current!, setProps, {
                      exportFilePrefix,
                      exportFileNames
                    });
                  }}
                >
                  {texts.modelGlb}
                </p>
                <p
                  key="image-export-usdz"
                  className="ms-dropdown-item"
                  onClick={() => {
                    requestSceneExport(ExportType.usdz, sceneRef.current!, setProps, {
                      exportFilePrefix,
                      exportFileNames
                    });
                  }}
                >
                  {texts.augmentedRealityIosOnly}
                </p>
              </Dropdown>
            </div>
          }
        >
          {texts.downloadVisualizationAs}
        </Tooltip>
      )}
      {showExportButton && (
        <Tooltip
          place="left"
          trigger={
            <div data-tooltip-id={`export-${tooltipId}`} onClick={() => hideTooltip()}>
              <Dropdown triggerIcon={<Download />} isArrowless isRight>
                {fileOptions?.map((option, i) => (
                  <p
                    key={`file-export-${i}`}
                    className="ms-dropdown-item"
                    onClick={() => {
                      setProps({ fileType: option, fileTimestamp: Date.now() });
                    }}
                  >
                    {option}
                  </p>
                ))}
              </Dropdown>
            </div>
          }
        >
          {texts.exportAs}
        </Tooltip>
      )}
    </ButtonBar>
  );
}
