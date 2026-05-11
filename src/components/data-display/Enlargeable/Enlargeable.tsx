import clsx from 'clsx';
import { type Dispatch, type ReactNode, type SetStateAction, useState } from 'react';
import { FaCompress, FaExpand } from 'react-icons/fa';

export interface EnlargeableProps {
  id?: string;
  setProps?: (value: any) => any;
  className?: string;
  expanded?: boolean;
  setExpanded?: Dispatch<SetStateAction<boolean>>;
  hideButton?: boolean;
  children?: ReactNode;
}

export const Enlargeable = ({
  id,
  className = '',
  expanded: controlledExpanded,
  setExpanded: controlledSetExpanded,
  hideButton = false,
  children,
}: EnlargeableProps) => {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = controlledExpanded ?? internalExpanded;
  const setExpanded = controlledSetExpanded ?? setInternalExpanded;

  return (
    <div
      id={id}
      className={clsx('ms-enlargeable', {
        'ms-modal ms-is-active': expanded,
        [className]: !expanded,
      })}
      data-slot="overlay-root"
    >
      <div
        className={clsx({
          'ms-modal-background': expanded,
        })}
        data-slot="overlay-backdrop"
        onClick={() => setExpanded(false)}
      />
      <div
        className={clsx({
          'ms-modal-content ms-is-large': expanded,
          [className]: expanded,
        })}
        data-slot="overlay-content"
      >
        {!hideButton ? (
          <button className="ms-button ms-enlarge-button" data-slot="overlay-toggle" onClick={() => setExpanded(!expanded)}>
            {expanded ? <FaCompress /> : <FaExpand />}
          </button>
        ) : null}
        {children}
      </div>
    </div>
  );
};
