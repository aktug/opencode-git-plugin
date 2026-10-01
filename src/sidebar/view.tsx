/** @jsxImportSource @opentui/solid */
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"
import { createDiffOpener } from "../diff"
import { createGitRunner } from "../git"
import { setDiffClosedHandler, useDiffStore } from "../state"
import type { ChangeFile, LayoutResizeEmitter, RenderNode } from "../types"
import { FileList } from "./file-list"
import { bindSidebarFocus } from "./focus"
import { SidebarHeader } from "./header"
import { registerSidebarKeymaps } from "./keymap"
import { createListNavigation } from "./list-navigation"
import { createStaging } from "./staging"
import { SidebarStatus } from "./status"
import { createWorkingCopy } from "./working-copy"

export function GitChangesView(props: { ctx: Context }) {
  const { ctx } = props
  const [sidebarWidth, setSidebarWidth] = createSignal(46)
  const [diffView] = useDiffStore(ctx)
  let sidebarNode: RenderNode | undefined

  const currentLocation = () => {
    const loc = ctx.location ?? ctx.data.location.default()
    return { directory: loc.directory }
  }

  const git = createGitRunner(ctx, () => currentLocation().directory)
  const openDiff = createDiffOpener(ctx, currentLocation)
  const workingCopy = createWorkingCopy(ctx, currentLocation, (count) => {
    nav.clampSelection(count)
    void staging.scheduleRefresh()
  })
  const staging = createStaging(ctx, git, currentLocation, workingCopy.refresh)
  const nav = createListNavigation(ctx, workingCopy.files)

  const openSelectedDiff = () => {
    const f = nav.selectedFile()
    if (f) void openDiff(f).catch(() => {})
  }
  const setSelectedFileStaged = (stage: boolean) => {
    const f = nav.selectedFile()
    if (f) staging.applyChange(f.file, stage)
  }
  const selectFile = (f: ChangeFile, index: number) => {
    nav.setSelected(index)
    if (nav.stageMode()) staging.toggle(f.file)
    else void openDiff(f).catch(() => {})
  }

  void workingCopy.refresh().catch(() => {})
  void staging.scheduleRefresh().catch(() => {})

  registerSidebarKeymaps(ctx, {
    files: workingCopy.files,
    nav,
    diffOpen: () => diffView.panelOpen,
    requestRefresh: workingCopy.requestRefresh,
    actions: {
      next: nav.selectNext,
      prev: nav.selectPrevious,
      open: openSelectedDiff,
      setStaged: setSelectedFileStaged,
      commit: () => void staging.commit(),
    },
  })

  const restoreListFocus = () => {
    if (!nav.navMode() || diffView.panelOpen) return
    nav.ensure()
  }
  setDiffClosedHandler(() => {
    if (!nav.navMode() && workingCopy.files().length > 0) nav.enter()
    restoreListFocus()
  })
  createEffect((wasOpen: boolean | undefined) => {
    const open = diffView.panelOpen
    if (wasOpen === true && open === false && nav.navMode()) {
      setTimeout(() => restoreListFocus(), 0)
    }
    return open
  })
  bindSidebarFocus(ctx, {
    container: () => sidebarNode,
    active: () => nav.navMode() && !diffView.panelOpen,
    exit: nav.exit,
  })
  onCleanup(() => setDiffClosedHandler(undefined))

  const setSidebarRef = (el: RenderNode) => {
    sidebarNode = el
    setSidebarWidth(el.width)
    const onNodeResize = () => setSidebarWidth(el.width)
    ;(el as unknown as LayoutResizeEmitter).on("resize", onNodeResize)
    onCleanup(() => (el as unknown as LayoutResizeEmitter).off("resize", onNodeResize))
  }

  const ready = () => !workingCopy.loading() && !workingCopy.error()
  const hasFiles = () => workingCopy.files().length > 0

  const sidebarBody = (
    <>
      <SidebarHeader
        ctx={ctx}
        branch={workingCopy.branch()}
        fileCount={workingCopy.files().length}
        ready={ready()}
        additions={workingCopy.additions()}
        deletions={workingCopy.deletions()}
        navMode={nav.navMode()}
        stageMode={nav.stageMode()}
        hasStaged={staging.staged().size > 0}
        onBranchClick={nav.toggleStageMode}
        onCommit={() => void staging.commit()}
      />
      <SidebarStatus
        ctx={ctx}
        loading={workingCopy.loading()}
        error={workingCopy.error()}
        hasFiles={hasFiles()}
        branch={workingCopy.branch()}
      />
      <Show when={ready() && hasFiles()}>
        <FileList
          ctx={ctx}
          files={workingCopy.files()}
          staged={staging.staged()}
          selected={nav.selected()}
          navMode={nav.navMode()}
          width={sidebarWidth()}
          onSelect={selectFile}
        />
      </Show>
    </>
  )

  return (
    <Show
      when={nav.navMode()}
      fallback={
        <box flexDirection="column" gap={1} ref={setSidebarRef}>
          {sidebarBody}
        </box>
      }
    >
      <box
        flexDirection="column"
        gap={1}
        border={["top", "bottom"]}
        borderStyle="rounded"
        borderColor={ctx.theme.text.feedback.warning.base}
        focusedBorderColor={ctx.theme.text.feedback.warning.base}
        ref={setSidebarRef}
      >
        {sidebarBody}
      </box>
    </Show>
  )
}
