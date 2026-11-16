import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResolvedDesignProvider } from '../rendering/context';
import { useDesignValues } from './use-design-values';

describe('useDesignValues', () => {
  it('reads the enclosing resolved design values', () => {
    let captured: Record<string, unknown> = {};
    function Probe() {
      captured = useDesignValues();
      return null;
    }
    renderToStaticMarkup(
      <ResolvedDesignProvider value={{ cfBackgroundColor: '#4f39f6', cfPadding: '24px' }}>
        <Probe />
      </ResolvedDesignProvider>
    );
    expect(captured).toEqual({ cfBackgroundColor: '#4f39f6', cfPadding: '24px' });
  });

  it('accepts a type argument that types the returned values (useState-style)', () => {
    interface MyDesign {
      cfBackgroundColor?: string;
      cfPadding?: string;
    }
    let typed: MyDesign = {};
    function Probe() {
      const design = useDesignValues<MyDesign>();
      typed = { cfBackgroundColor: design.cfBackgroundColor, cfPadding: design.cfPadding };
      return null;
    }
    renderToStaticMarkup(
      <ResolvedDesignProvider value={{ cfPadding: '24px' }}>
        <Probe />
      </ResolvedDesignProvider>
    );
    expect(typed).toEqual({ cfBackgroundColor: undefined, cfPadding: '24px' });
  });

  it('returns {} when the enclosing design record is empty', () => {
    let captured: Record<string, unknown> | null = null;
    function Probe() {
      captured = useDesignValues<Record<string, unknown>>();
      return null;
    }
    renderToStaticMarkup(
      <ResolvedDesignProvider value={{}}>
        <Probe />
      </ResolvedDesignProvider>
    );
    expect(captured).toEqual({});
  });

  it('returns {} when called outside any renderer subtree', () => {
    let captured: Record<string, unknown> | null = null;
    function Probe() {
      captured = useDesignValues<Record<string, unknown>>();
      return null;
    }
    renderToStaticMarkup(<Probe />);
    expect(captured).toEqual({});
  });
});
