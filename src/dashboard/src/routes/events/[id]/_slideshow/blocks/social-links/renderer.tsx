import { useMemo } from 'react';
import type { SlideshowBlock, SlideshowContext, SocialLinksProps } from '../../types';
import { getBlockDef, blockRegistry } from '../registry';

function createInternalBlock(
  type: string,
  props: any,
  children?: SlideshowBlock[],
): SlideshowBlock {
  const def = blockRegistry.get(type);
  if (!def) throw new Error(`Unknown block type: ${type}`);

  return {
    id: `internal-${type}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    enabled: true,
    props: { ...def.defaultProps, ...props },
    children,
  };
}

function buildSocialLinksTree(props: SocialLinksProps): SlideshowBlock[] {
  const socialIcons = props.links.map((link) =>
    createInternalBlock('social-icon', { platform: link.platform, url: link.url }),
  );

  const flexProps = {
    direction: props.variant === 'vertical-list' ? ('column' as const) : ('row' as const),
    align: 'center' as const,
    justify: 'center' as const,
    gap: 'md' as const,
    padding: 'md' as const,
    wrap: false,
  };

  return [createInternalBlock('flex', flexProps, socialIcons)];
}

export function SocialLinksRenderer({
  block,
  context,
}: {
  block: SlideshowBlock;
  context: SlideshowContext;
}) {
  const props = block.props as SocialLinksProps;

  const internalBlocks = useMemo(
    () => buildSocialLinksTree(props),
    [props.variant, JSON.stringify(props.links)],
  );

  return (
    <div data-composite-block="social-links">
      {internalBlocks.map((child) => {
        const def = getBlockDef(child.type);
        if (!def) return null;
        return <def.Renderer key={child.id} block={child} context={context} />;
      })}
    </div>
  );
}
