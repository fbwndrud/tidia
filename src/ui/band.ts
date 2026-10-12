import type { Elements, RenderElement } from 'claude-code'
import type { BandView } from '../../types'
import type { Locale } from '../config'
import { showEntry } from '../dict/dict'
import { t } from '../i18n'

// The terminal's and the desktop's tables take the same props for these two elements.
export type BandEls = Pick<Elements['terminal'], 'Box' | 'Text'>

// The polished text previewed in the band, cut so a long one stays a few lines.
const PREVIEW_CHARS = 400

export function renderBand(els: BandEls, view: BandView, locale: Locale): RenderElement {
  const { Box, Text } = els
  switch (view.kind) {
    case 'polishing':
      return Text({ dimColor: true, children: [`✨ ${t(locale, 'polishing')}`] })
    case 'ready':
      return Box({
        key: 'ready',
        flexDirection: 'column',
        children: [
          // The sparkle sits in its own column so a list preview keeps its markers aligned.
          Box({
            flexDirection: 'row',
            columnGap: 1,
            children: [
              Text({ dimColor: true, children: ['✨'] }),
              Text({ children: [view.text.length > PREVIEW_CHARS ? `${view.text.slice(0, PREVIEW_CHARS)}…` : view.text] }),
            ],
          }),
        ],
      })
    case 'sending':
      return Text({ dimColor: true, children: [`✨ ${t(locale, 'sending')}`] })
    case 'failed':
      return Text({ color: 'warning', children: [`⚠ ${t(locale, 'failed')}`] })
    case 'learned':
      return Text({ color: 'success', children: [`📖 ${t(locale, 'learn_added', { entry: showEntry(view) })}`] })
  }
}
