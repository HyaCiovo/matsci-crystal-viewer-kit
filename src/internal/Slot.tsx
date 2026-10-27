import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  version as reactVersion,
  type HTMLAttributes,
  type ReactElement,
  type Ref,
} from 'react';

/** React 19 把 ref 变成普通 prop，并移除了 element.ref；按版本选择安全取值方式。 */
const IS_REACT_19_OR_NEWER = Number.parseInt(reactVersion.split('.')[0] ?? '18', 10) >= 19;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  (ref as { current: T | null }).current = value;
}

function composeRefs<T>(...refs: Array<Ref<T> | undefined>): Ref<T> {
  return (value: T | null) => refs.forEach((ref) => assignRef(ref, value));
}

function getChildRef(child: ReactElement): Ref<HTMLElement> | undefined {
  const propsRef = (child.props as { ref?: Ref<HTMLElement> }).ref;
  if (propsRef) return propsRef;
  if (IS_REACT_19_OR_NEWER) return undefined;
  return (child as unknown as { ref?: Ref<HTMLElement> }).ref;
}

/**
 * 极简 asChild：把 props / className / ref 合并到唯一子元素上。
 * 不引入 Radix Slot，避免其在 React 19 下访问已移除的 element.ref。
 */
export const Slot = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>((props, forwardedRef) => {
  const { children, ...slotProps } = props;
  if (!isValidElement(children)) return null;

  const child = Children.only(children) as ReactElement<Record<string, unknown>>;
  const childProps = child.props;
  const mergedProps: Record<string, unknown> = {
    ...slotProps,
    ...childProps,
    className: [slotProps.className, childProps.className].filter(Boolean).join(' '),
    ref: composeRefs(forwardedRef, getChildRef(child)),
  };
  return cloneElement(child, mergedProps);
});

Slot.displayName = 'Slot';
