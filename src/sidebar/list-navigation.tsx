import { createSignal, onCleanup, type Accessor } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"
import { LIST_NAV_MODE } from "../config"
import type { ChangeFile } from "../types"

export type ListNavigation = ReturnType<typeof createListNavigation>

export function createListNavigation(ctx: Context, files: Accessor<ChangeFile[]>) {
  const [navMode, setNavMode] = createSignal(false)
  const [stageMode, setStageMode] = createSignal(false)
  const [selected, setSelected] = createSignal(0)

  let popListNavMode: (() => void) | null = null

  const pushListNavMode = () => {
    popListNavMode = ctx.keymap.mode.push(LIST_NAV_MODE)
  }

  const enter = () => {
    if (popListNavMode) {
      try {
        if (ctx.keymap.mode.current() === LIST_NAV_MODE) return
      } catch {
        return
      }
      popListNavMode = null
    }
    pushListNavMode()
    setNavMode(true)
  }

  const exit = () => {
    try {
      if (ctx.keymap.mode.current() === LIST_NAV_MODE) popListNavMode?.()
    } catch {
    }
    popListNavMode = null
    setNavMode(false)
    setStageMode(false)
  }

  const ensure = () => {
    if (!navMode()) return
    try {
      if (ctx.keymap.mode.current() !== LIST_NAV_MODE) {
        popListNavMode = null
        pushListNavMode()
      }
    } catch {
    }
  }

  const selectNext = () => {
    const count = files().length
    if (count > 0) setSelected((prev) => (prev + 1) % count)
  }

  const selectPrevious = () => {
    const count = files().length
    if (count > 0) setSelected((prev) => (prev - 1 + count) % count)
  }

  const clampSelection = (count: number) => {
    setSelected((prev) => Math.min(prev, Math.max(0, count - 1)))
  }

  const selectedFile = (): ChangeFile | undefined => {
    const list = files()
    return list[Math.min(selected(), list.length - 1)]
  }

  const toggleStageMode = () => {
    if (files().length === 0) return
    const next = !stageMode()
    setStageMode(next)
    if (next) enter()
  }

  onCleanup(exit)

  return {
    navMode,
    stageMode,
    setStageMode,
    selected,
    setSelected,
    enter,
    exit,
    ensure,
    selectNext,
    selectPrevious,
    clampSelection,
    selectedFile,
    toggleStageMode,
  }
}
