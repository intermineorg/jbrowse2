import { readConfObject } from '@jbrowse/core/configuration'
import GlyphType from '@jbrowse/core/pluggableElementTypes/GlyphType'
import { stripAlpha } from '@jbrowse/core/util'

import { drawModel, isUTR } from './drawModel'

import type { PartLayout } from './drawModel'
import type PluginManager from '@jbrowse/core/PluginManager'
import type { Feature } from '@jbrowse/core/util'

/**
 * InterMine features (they carry `intermineClass`) that have exon structure.
 * Features from other plugins and adapters keep JBrowse's own glyphs.
 */
export function matchesInterMineModel(feature: Feature) {
  const subs = feature.get('subfeatures') as Feature[] | undefined
  return !!feature.get('intermineClass') && !!subs?.length
}

export default function register(pluginManager: PluginManager) {
  pluginManager.addGlyphType(
    () =>
      new GlyphType({
        name: 'InterMineIntronHat',
        displayName: 'Transcript with caret introns',
        match: matchesInterMineModel,
        priority: 10,
        draw({ ctx, featureLayout, config, theme, reversed, canvasWidth }) {
          const read = (slot: string, part: PartLayout) =>
            readConfObject(config, slot, { feature: part.feature }) as string
          drawModel(
            ctx,
            featureLayout as PartLayout,
            {
              fill: part => read(isUTR(part) ? 'color3' : 'color1', part),
              outline: part => read('outline', part) || undefined,
              stroke: row => {
                const c = read('color2', row)
                // '#f0f' is the renderer's "not set" value, as in JBrowse's own glyphs
                return c === '#f0f' ? stripAlpha(theme.palette.text.secondary) : c
              },
            },
            { reversed, canvasWidth },
          )
        },
      }),
  )
}
