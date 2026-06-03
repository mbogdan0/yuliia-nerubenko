export function requiredElement<TElement extends Element>(selector: string): TElement {
  const element = document.querySelector<TElement>(selector);
  if (!element) {
    throw new Error(`Demo markup is missing required element: ${selector}`);
  }
  return element;
}
