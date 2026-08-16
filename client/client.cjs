/**
 * dsh-mem0 — browser half.
 *
 * Registers the "dsh-mem0" configuration card into the Web settings panel:
 * 设置面板 → 插件 → 插件配置 (the official `settings.plugin.item` slot,
 * rendered by the ui-settings-plugins "configurable" tab).
 *
 * The card does NOT use the harness settings RPC: that wire only exposes
 * namespaces on the harness's own allowlist, which a plugin cannot widen.
 * Instead it reads/writes the host-registered `dsh-mem0` settings namespace
 * through the plugin-owned /api/dsh-mem0/config route (see
 * src/settings-routes.ts). The API key never rides the wire: the host
 * redacts it and answers with a configured flag only.
 *
 * This file is the shipped bundle artifact: the dsh client module loader
 * serves it at /plugins/dsh-mem0/client.js and calls
 * window.__ModuleLoader__.load({ id, factory }). It is plain JavaScript on
 * purpose — the package builds with tsc only (no bundler), and the loader
 * accepts any file that registers itself in this format.
 *
 * Export discipline mirrors the host half: the /client surface carries only
 * the plugin contract (apply / inject); everything else stays internal.
 */

window.__ModuleLoader__.load({
  id: 'dsh-mem0',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { createSnapshotStore } = require('@deepseek-ai/dsh-client-runtime/client')

    const h = React.createElement

    /** Settings namespace this card edits (spelled, not imported — a client bundle must not depend on a Host package). */
    const NS = 'dsh-mem0'

    /** The plugin-owned config route (mirrors CONFIG_ROUTE in src/settings-routes.ts). */
    const CONFIG_ROUTE = '/api/dsh-mem0/config'

    // ---------------------------------------------------------------- locale

    const zh = {
      title: 'dsh-mem0',
      description: '自托管 mem0 记忆读写的服务地址、认证与默认标识符。',
      overridden: '已覆盖',
      reset: '恢复默认',
      unsaved: '未保存',
      save: '保存',
      saving: '保存中…',
      discard: '放弃修改',
      saveFailed: '本部署没有接受这些值，已保留供你修改。',
      readOnly: '本部署的设置为只读。',
      expand: '展开设置',
      collapse: '收起设置',
      invalidNumber: '请填数字；留空表示使用默认值。',
      baseUrl: '服务地址（baseUrl）',
      baseUrlHint: 'mem0 REST 服务地址，无尾斜杠、无 /v1。',
      apiKey: 'API Key',
      apiKeyHint: '留空表示保持当前密钥。',
      apiKeySet: '已配置',
      apiKeyUnset: '未配置',
      authType: '认证方式（authType）',
      authTypeHint: 'apiKey / adminKey / jwt / none。',
      defaultUserId: '默认 user_id',
      defaultUserIdHint: '工具未指定 user_id 时的默认归属。',
      defaultAgentId: '默认 agent_id',
      defaultAgentIdHint: '工具未指定 agent_id 时的默认归属（写入时生效）。',
      timeoutMs: '单请求超时（毫秒）',
      timeoutMsHint: '单个 mem0 请求允许运行多久，超时即终止。',
      announceToAgent: '向 Agent 宣告能力',
      announceToAgentHint: '是否在系统提示中宣告 mem0_* 工具。',
      enabled: '启用',
      enabledHint: '总开关；关闭后不再注册工具与宣告。',
    }

    const en = {
      title: 'dsh-mem0',
      description: 'Server, auth, and default identifiers for the self-hosted mem0 memory store.',
      overridden: 'Overridden',
      reset: 'Reset to default',
      unsaved: 'Unsaved',
      save: 'Save',
      saving: 'Saving…',
      discard: 'Discard',
      saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
      readOnly: 'This deployment stores settings read-only.',
      expand: 'Show settings',
      collapse: 'Hide settings',
      invalidNumber: 'Enter a number, or leave blank to use the default.',
      baseUrl: 'Server URL (baseUrl)',
      baseUrlHint: 'mem0 REST endpoint, no trailing slash, no /v1.',
      apiKey: 'API key',
      apiKeyHint: 'Leave blank to keep the current key.',
      apiKeySet: 'A key is configured.',
      apiKeyUnset: 'No key is configured.',
      authType: 'Auth type (authType)',
      authTypeHint: 'apiKey / adminKey / jwt / none.',
      defaultUserId: 'Default user_id',
      defaultUserIdHint: 'Owner used when a tool call does not specify one.',
      defaultAgentId: 'Default agent_id',
      defaultAgentIdHint: 'Agent used for writes when a tool call does not specify one.',
      timeoutMs: 'Request timeout (ms)',
      timeoutMsHint: 'How long one mem0 request may run before it is terminated.',
      announceToAgent: 'Announce to agents',
      announceToAgentHint: 'Whether the mem0_* tools are announced in the system prompt.',
      enabled: 'Enabled',
      enabledHint: 'Master switch; when off, tools and the announcement are not registered.',
    }

    // ------------------------------------------------------------ form model

    /** A whole-number field; an empty draft clears the field, a non-number blocks the save. */
    function numberField(field) {
      return {
        field,
        kind: 'number',
        format: (value) => (typeof value === 'number' ? String(value) : ''),
        parse: (text) => {
          const trimmed = text.trim()
          if (trimmed === '') return { kind: 'clear' }
          const parsed = Number(trimmed)
          return Number.isFinite(parsed) ? { kind: 'set', value: parsed } : undefined
        },
      }
    }

    /** A free-text field; an empty draft clears the field. */
    function textField(field) {
      return {
        field,
        kind: 'text',
        format: (value) => (typeof value === 'string' ? value : ''),
        parse: (text) => {
          const trimmed = text.trim()
          return trimmed === '' ? { kind: 'clear' } : { kind: 'set', value: trimmed }
        },
      }
    }

    /** A one-of field rendered as a select. */
    function selectField(field, options) {
      return {
        field,
        kind: 'select',
        options,
        format: (value) => (typeof value === 'string' && options.includes(value) ? value : options[0] ?? ''),
        parse: (text) => (options.includes(text) ? { kind: 'set', value: text } : undefined),
      }
    }

    /** A boolean field rendered as a checkbox. */
    function boolField(field) {
      return { field, kind: 'bool', format: (value) => value === true }
    }

    /** A write-only credential field: the draft never clears, a blank saves nothing. */
    function secretField(field) {
      return {
        field,
        kind: 'secret',
        format: () => '',
        parse: (text) => {
          const trimmed = text.trim()
          return trimmed === '' ? undefined : { kind: 'set', value: trimmed }
        },
      }
    }

    /** Every field this card edits, in render order. */
    const FIELD_SPECS = [
      textField('baseUrl'),
      secretField('apiKey'),
      selectField('authType', ['apiKey', 'adminKey', 'jwt', 'none']),
      textField('defaultUserId'),
      textField('defaultAgentId'),
      numberField('timeoutMs'),
      boolField('announceToAgent'),
      boolField('enabled'),
    ]

    /**
     * The unavailable snapshot shape (the route answered 404/503 or the
     * namespace is not registered host-side — the card renders nothing).
     */
    function unavailableSnapshot() {
      return {
        status: 'unavailable',
        value: undefined,
        base: undefined,
        user: undefined,
        writable: false,
        revision: undefined,
        apiKeyConfigured: false,
      }
    }

    /** Normalize one host route view into the scope snapshot Mem0Form reads. */
    function normalizeView(view) {
      if (typeof view !== 'object' || view === null) return unavailableSnapshot()
      return {
        status: view.status === 'ready' ? 'ready' : 'unavailable',
        value: view.value,
        base: view.base,
        user: view.user,
        writable: view.writable === true,
        revision: typeof view.revision === 'number' ? view.revision : undefined,
        apiKeyConfigured: view.apiKeyConfigured === true,
      }
    }

    /**
     * Fetch-backed scope over /api/dsh-mem0/config — the card's read/write
     * path. Implements the same surface Mem0Form consumes (getSnapshot /
     * subscribe / set / unset), so the form model and controller are shared
     * with the settings-scope design; only the transport differs.
     */
    class RouteScope {
      constructor() {
        this.store = createSnapshotStore(unavailableSnapshot())
      }

      getSnapshot() {
        return this.store.getSnapshot()
      }

      subscribe(listener) {
        return this.store.subscribe(listener)
      }

      /** GET the redacted view. */
      async load() {
        try {
          const response = await fetch(CONFIG_ROUTE, { headers: { accept: 'application/json' } })
          if (!response.ok) {
            this.store.set(unavailableSnapshot())
            return
          }
          this.store.set(normalizeView(await response.json()))
        } catch {
          this.store.set(unavailableSnapshot())
        }
      }

      /** POST one field write (or a clear) and re-publish the host view. */
      async write(body) {
        const response = await fetch(CONFIG_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(body),
        })
        if (!response.ok) throw new Error(`config write failed: ${response.status}`)
        this.store.set(normalizeView(await response.json()))
      }

      set(field, value) {
        return this.write({ set: { [field]: value } })
      }

      unset(field) {
        return this.write({ unset: [field] })
      }
    }

    /**
     * Staged form over one settings namespace. The card shows the effective
     * value (user layer over composition base over schema default) and stages
     * what the user types; only Save turns a draft into a durable, revision-
     * fenced document mutation. A field's PRESENCE in the user layer — not a
     * value comparison — is what marks it overridden.
     */
    class Mem0Form {
      constructor(scope, specs) {
        this.scope = scope
        this.specs = new Map(specs.map((spec) => [spec.field, spec]))
        this.staged = new Map()
        this.listeners = new Set()
        this.saving = false
        this.failed = false
        scope.subscribe(() => this.publish())
      }

      /** Publish a projection rebuilt on every scope or draft change. */
      bind(project) {
        const store = createSnapshotStore(project())
        this.listeners.add(() => store.set(project()))
        return store
      }

      snapshot() {
        return this.scope.getSnapshot()
      }

      valueOf(field) {
        return this.snapshot().value?.[field]
      }

      baseOf(field) {
        return this.snapshot().base?.[field]
      }

      stored(field) {
        const user = this.snapshot().user
        return user !== undefined && Object.prototype.hasOwnProperty.call(user, field)
      }

      spec(field) {
        const spec = this.specs.get(field)
        if (spec === undefined) throw new Error(`mem0 card has no field ${field}`)
        return spec
      }

      /** Card-level state: availability, writability, and what a save would do. */
      shell() {
        const plan = this.plan()
        const snapshot = this.snapshot()
        return {
          available: snapshot.status === 'ready',
          writable: snapshot.writable,
          dirty: plan.length > 0,
          invalid: plan.some((item) => item.run === undefined),
          saving: this.saving,
          failed: this.failed,
        }
      }

      /** One control's projection: staged draft, override mark, and validity. */
      field(field) {
        const spec = this.spec(field)
        const staged = this.staged.get(field)
        if (staged === undefined) {
          if (spec.kind === 'bool') return { checked: spec.format(this.valueOf(field)), overridden: this.stored(field), invalid: false }
          if (spec.kind === 'secret') return { text: '', configured: this.snapshot().apiKeyConfigured === true, overridden: false, invalid: false }
          return { text: spec.format(this.valueOf(field)), overridden: this.stored(field), invalid: false }
        }
        if (spec.kind === 'bool') {
          if (staged.reset) return { checked: spec.format(this.baseOf(field)), overridden: this.stored(field), invalid: false }
          return { checked: staged.checked, overridden: staged.checked !== spec.format(this.valueOf(field)), invalid: false }
        }
        if (spec.kind === 'secret') {
          return { text: staged.text, configured: this.snapshot().apiKeyConfigured === true || staged.text.trim() !== '', overridden: false, invalid: false }
        }
        const write = staged.clear ? { kind: 'clear' } : spec.parse(staged.text)
        // The badge means "a save would actually change something": a set only
        // counts when the draft differs from the effective value (plan() skips
        // identical drafts), a clear only when a stored override stands.
        const overridden =
          write !== undefined &&
          (write.kind === 'clear' ? this.stored(field) : staged.text !== spec.format(this.valueOf(field)))
        return {
          text: staged.text,
          overridden,
          invalid: write === undefined,
        }
      }

      /** Every staged edit a save would write; an invalid draft carries no write. */
      plan() {
        const plan = []
        for (const [field, staged] of this.staged) {
          const spec = this.spec(field)
          if (spec.kind === 'bool') {
            if (staged.reset) {
              if (this.stored(field)) plan.push({ field, run: () => this.scope.unset(field) })
            } else if (staged.checked !== spec.format(this.valueOf(field))) {
              plan.push({ field, run: () => this.scope.set(field, staged.checked) })
            }
            continue
          }
          if (spec.kind === 'secret') {
            const value = staged.text.trim()
            if (value !== '') plan.push({ field, run: () => this.scope.set(field, value) })
            continue
          }
          if (staged.clear) {
            if (this.stored(field)) plan.push({ field, run: () => this.scope.unset(field) })
            continue
          }
          if (staged.text === spec.format(this.valueOf(field))) continue
          const write = spec.parse(staged.text)
          if (write === undefined) plan.push({ field, run: undefined })
          else if (write.kind === 'clear') plan.push({ field, run: () => this.scope.unset(field) })
          else plan.push({ field, run: () => this.scope.set(field, write.value) })
        }
        return plan
      }

      /** Write every staged edit, then re-seed from what the Host accepted. */
      async save() {
        const plan = this.plan()
        const writes = plan.flatMap((item) => (item.run === undefined ? [] : [item.run]))
        if (plan.length === 0 || this.saving || writes.length !== plan.length) return
        this.saving = true
        this.failed = false
        this.publish()
        let landed = true
        for (const write of writes) {
          try {
            await write()
          } catch {
            landed = false
          }
        }
        if (landed) this.staged.clear()
        this.saving = false
        this.failed = !landed
        this.publish()
      }

      /** The actions a card's slot entry injects. */
      actions() {
        return {
          edit: (field, text) => {
            this.staged.set(field, { text, clear: false })
            this.failed = false
            this.publish()
          },
          toggle: (field, checked) => {
            this.staged.set(field, { checked })
            this.failed = false
            this.publish()
          },
          resetField: (field) => {
            const spec = this.spec(field)
            if (spec.kind === 'bool') this.staged.set(field, { reset: true })
            else this.staged.set(field, { text: spec.format(this.baseOf(field)), clear: true })
            this.failed = false
            this.publish()
          },
          save: () => this.save(),
          discard: () => {
            if (this.staged.size === 0 && !this.failed) return
            this.staged.clear()
            this.failed = false
            this.publish()
          },
        }
      }

      publish() {
        for (const listener of this.listeners) listener()
      }
    }

    /** Bridges the `dsh-mem0` scope onto the card's staged form. */
    class Mem0CardController {
      constructor(scope) {
        this.form = new Mem0Form(scope, FIELD_SPECS)
        this.store = this.form.bind(() => this.projection())
      }

      projection() {
        const fields = {}
        for (const spec of FIELD_SPECS) fields[spec.field] = this.form.field(spec.field)
        return { ...this.form.shell(), ...fields }
      }

      /** The face the card's slot registration injects. */
      inject() {
        return { hooks: { mem0Card: this.store }, ...this.form.actions() }
      }
    }

    // ----------------------------------------------------------------- styles

    const CARD_CSS =
      '.mem0-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));border-radius:12px;transition:border-color .16s,background .16s}' +
      '.mem0-card:hover,.mem0-card-open{border-color:var(--dsw-alias-label-dimmed,var(--dsw-alias-label-secondary));background:var(--dsw-alias-bg-layer-2)}' +
      '.mem0-card-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}' +
      '.mem0-card-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}' +
      '.mem0-card-head{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}' +
      '.mem0-card-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}' +
      '.mem0-card-desc{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:13px;line-height:1.5}' +
      '.mem0-card-pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}' +
      '.mem0-card-chevron{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));flex:none;transition:transform .16s}' +
      '.mem0-card-chevron-open{transform:rotate(180deg)}' +
      '.mem0-card-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:12px 0 8px}' +
      '.mem0-card-readonly{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));margin:0 0 12px;font-size:12px;line-height:1.5}' +
      '.mem0-field{margin:0 0 12px}' +
      '.mem0-field-head{justify-content:space-between;align-items:baseline;gap:8px;display:flex}' +
      '.mem0-field-label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:1.5}' +
      '.mem0-field-badges{align-items:center;gap:8px;display:flex}' +
      '.mem0-field-badge{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1));border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px}' +
      '.mem0-field-badge-on{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1));border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px}' +
      '.mem0-field-reset{appearance:none;font:inherit;cursor:pointer;border:0;background:0 0;color:var(--dsw-alias-link-primary,var(--dsw-alias-brand-primary));font-size:12px;padding:0}' +
      '.mem0-field-reset:disabled{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));cursor:default}' +
      '.mem0-field-input{box-sizing:border-box;width:100%;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;margin-top:6px;padding:6px 10px;font-size:13px;line-height:1.5}' +
      '.mem0-field-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}' +
      '.mem0-field-input-invalid{border-color:var(--dsw-alias-state-error-primary)}' +
      '.mem0-field-hint{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));margin:4px 0 0;font-size:12px;line-height:1.5}' +
      '.mem0-field-hint-invalid{color:var(--dsw-alias-state-error-primary)}' +
      '.mem0-field-check{display:flex;align-items:center;gap:8px;margin-top:6px}' +
      '.mem0-card-footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}' +
      '.mem0-card-failed{min-width:0;color:var(--dsw-alias-state-error-primary);flex:1;margin:0;font-size:12px;line-height:1.5}' +
      '.mem0-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}' +
      '.mem0-btn:disabled{cursor:default;opacity:.55}' +
      '.mem0-btn-discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:transparent}' +
      '.mem0-btn-save{color:#fff;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary))}'

    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="dsh-mem0/card.css"]') === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-mem0'
      tag.dataset.pluginCss = 'dsh-mem0/card.css'
      tag.textContent = CARD_CSS
      document.head.appendChild(tag)
    }

    // ------------------------------------------------------------- component

    /** One labelled text/number input row. */
    function TextField(props) {
      return h(
        'div',
        { className: 'mem0-field' },
        h(
          'div',
          { className: 'mem0-field-head' },
          h(
            'label',
            { className: 'mem0-field-label', htmlFor: props.id },
            props.label,
          ),
          props.overridden
            ? h(
                'span',
                { className: 'mem0-field-badges' },
                h('span', { className: 'mem0-field-badge' }, props.overriddenLabel),
                h(
                  'button',
                  { type: 'button', className: 'mem0-field-reset', disabled: props.disabled, onClick: props.onReset },
                  props.resetLabel,
                ),
              )
            : null,
        ),
        h('input', {
          id: props.id,
          className: props.invalid ? 'mem0-field-input mem0-field-input-invalid' : 'mem0-field-input',
          type: 'text',
          ...(props.numeric ? { inputMode: 'numeric' } : {}),
          ...(props.invalid ? { 'aria-invalid': true } : {}),
          value: props.text,
          disabled: props.disabled,
          onChange: (event) => props.onEdit(event.target.value),
        }),
        h(
          'p',
          { className: props.invalid ? 'mem0-field-hint mem0-field-hint-invalid' : 'mem0-field-hint' },
          props.invalid ? props.invalidLabel : props.hint,
        ),
      )
    }

    /** One write-only credential row. */
    function SecretField(props) {
      return h(
        'div',
        { className: 'mem0-field' },
        h(
          'div',
          { className: 'mem0-field-head' },
          h('label', { className: 'mem0-field-label', htmlFor: props.id }, props.label),
          h(
            'span',
            { className: 'mem0-field-badges' },
            h('span', { className: props.configured ? 'mem0-field-badge-on' : 'mem0-field-badge' }, props.stateLabel),
          ),
        ),
        h('input', {
          id: props.id,
          className: 'mem0-field-input',
          type: 'password',
          autoComplete: 'off',
          value: props.text,
          disabled: props.disabled,
          onChange: (event) => props.onEdit(event.target.value),
        }),
        h('p', { className: 'mem0-field-hint' }, props.hint),
      )
    }

    /** One select row. */
    function SelectField(props) {
      return h(
        'div',
        { className: 'mem0-field' },
        h(
          'div',
          { className: 'mem0-field-head' },
          h('label', { className: 'mem0-field-label', htmlFor: props.id }, props.label),
          props.overridden
            ? h(
                'span',
                { className: 'mem0-field-badges' },
                h('span', { className: 'mem0-field-badge' }, props.overriddenLabel),
                h(
                  'button',
                  { type: 'button', className: 'mem0-field-reset', disabled: props.disabled, onClick: props.onReset },
                  props.resetLabel,
                ),
              )
            : null,
        ),
        h(
          'select',
          {
            id: props.id,
            className: 'mem0-field-input',
            value: props.text,
            disabled: props.disabled,
            onChange: (event) => props.onPick(event.target.value),
          },
          props.options.map((option) => h('option', { key: option, value: option }, option)),
        ),
        h('p', { className: 'mem0-field-hint' }, props.hint),
      )
    }

    /** One checkbox row. */
    function BoolField(props) {
      return h(
        'div',
        { className: 'mem0-field' },
        h(
          'div',
          { className: 'mem0-field-head' },
          h('label', { className: 'mem0-field-label', htmlFor: props.id }, props.label),
          props.overridden
            ? h(
                'span',
                { className: 'mem0-field-badges' },
                h('span', { className: 'mem0-field-badge' }, props.overriddenLabel),
                h(
                  'button',
                  { type: 'button', className: 'mem0-field-reset', disabled: props.disabled, onClick: props.onReset },
                  props.resetLabel,
                ),
              )
            : null,
        ),
        h(
          'span',
          { className: 'mem0-field-check' },
          h('input', {
            id: props.id,
            type: 'checkbox',
            checked: props.checked,
            disabled: props.disabled,
            onChange: (event) => props.onToggle(event.target.checked),
          }),
          h('span', { className: 'mem0-field-hint' }, props.hint),
        ),
      )
    }

    /** The dsh-mem0 configuration card. */
    function Mem0Card(props) {
      const { t } = props
      const state = props.useMem0Card((snapshot) => snapshot)
      const [open, setOpen] = React.useState(false)
      if (!state.available) return null
      const blocked = !state.dirty || state.invalid || state.saving
      return h(
        'li',
        { className: open ? 'mem0-card mem0-card-open' : 'mem0-card' },
        h(
          'button',
          {
            type: 'button',
            className: 'mem0-card-header',
            'aria-expanded': open,
            'aria-label': `${t(open ? 'collapse' : 'expand')}: ${t('title')}`,
            onClick: () => setOpen(!open),
          },
          h(
            'span',
            { className: 'mem0-card-head' },
            h('span', { className: 'mem0-card-name' }, t('title')),
            h('span', { className: 'mem0-card-desc' }, t('description')),
          ),
          state.dirty ? h('span', { className: 'mem0-card-pending' }, t('unsaved')) : null,
          h('span', { className: open ? 'mem0-card-chevron mem0-card-chevron-open' : 'mem0-card-chevron', 'aria-hidden': true }, '▾'),
        ),
        open
          ? h(
              'div',
              { className: 'mem0-card-body' },
              !state.writable ? h('p', { className: 'mem0-card-readonly', role: 'status' }, t('readOnly')) : null,
              h(TextField, {
                id: 'mem0-config-base-url',
                label: t('baseUrl'),
                hint: t('baseUrlHint'),
                overriddenLabel: t('overridden'),
                resetLabel: t('reset'),
                invalidLabel: t('invalidNumber'),
                disabled: !state.writable,
                ...state.baseUrl,
                onEdit: (text) => props.edit('baseUrl', text),
                onReset: () => props.resetField('baseUrl'),
              }),
              h(SecretField, {
                id: 'mem0-config-api-key',
                label: t('apiKey'),
                hint: t('apiKeyHint'),
                stateLabel: state.apiKey.configured ? t('apiKeySet') : t('apiKeyUnset'),
                disabled: !state.writable,
                ...state.apiKey,
                onEdit: (text) => props.edit('apiKey', text),
              }),
              h(SelectField, {
                id: 'mem0-config-auth-type',
                label: t('authType'),
                hint: t('authTypeHint'),
                overriddenLabel: t('overridden'),
                resetLabel: t('reset'),
                disabled: !state.writable,
                options: ['apiKey', 'adminKey', 'jwt', 'none'],
                ...state.authType,
                onPick: (value) => props.edit('authType', value),
                onReset: () => props.resetField('authType'),
              }),
              h(TextField, {
                id: 'mem0-config-default-user',
                label: t('defaultUserId'),
                hint: t('defaultUserIdHint'),
                overriddenLabel: t('overridden'),
                resetLabel: t('reset'),
                invalidLabel: t('invalidNumber'),
                disabled: !state.writable,
                ...state.defaultUserId,
                onEdit: (text) => props.edit('defaultUserId', text),
                onReset: () => props.resetField('defaultUserId'),
              }),
              h(TextField, {
                id: 'mem0-config-default-agent',
                label: t('defaultAgentId'),
                hint: t('defaultAgentIdHint'),
                overriddenLabel: t('overridden'),
                resetLabel: t('reset'),
                invalidLabel: t('invalidNumber'),
                disabled: !state.writable,
                ...state.defaultAgentId,
                onEdit: (text) => props.edit('defaultAgentId', text),
                onReset: () => props.resetField('defaultAgentId'),
              }),
              h(TextField, {
                id: 'mem0-config-timeout',
                label: t('timeoutMs'),
                hint: t('timeoutMsHint'),
                overriddenLabel: t('overridden'),
                resetLabel: t('reset'),
                invalidLabel: t('invalidNumber'),
                numeric: true,
                disabled: !state.writable,
                ...state.timeoutMs,
                onEdit: (text) => props.edit('timeoutMs', text),
                onReset: () => props.resetField('timeoutMs'),
              }),
              h(BoolField, {
                id: 'mem0-config-announce',
                label: t('announceToAgent'),
                hint: t('announceToAgentHint'),
                overriddenLabel: t('overridden'),
                resetLabel: t('reset'),
                disabled: !state.writable,
                ...state.announceToAgent,
                onToggle: (checked) => props.toggle('announceToAgent', checked),
                onReset: () => props.resetField('announceToAgent'),
              }),
              h(BoolField, {
                id: 'mem0-config-enabled',
                label: t('enabled'),
                hint: t('enabledHint'),
                overriddenLabel: t('overridden'),
                resetLabel: t('reset'),
                disabled: !state.writable,
                ...state.enabled,
                onToggle: (checked) => props.toggle('enabled', checked),
                onReset: () => props.resetField('enabled'),
              }),
              h(
                'div',
                { className: 'mem0-card-footer' },
                state.failed ? h('p', { className: 'mem0-card-failed', role: 'status' }, t('saveFailed')) : null,
                h(
                  'button',
                  { type: 'button', className: 'mem0-btn mem0-btn-discard', disabled: !state.dirty || state.saving, onClick: props.discard },
                  t('discard'),
                ),
                h(
                  'button',
                  { type: 'button', className: 'mem0-btn mem0-btn-save', disabled: blocked, onClick: props.save },
                  t(state.saving ? 'saving' : 'save'),
                ),
              ),
            )
          : null,
      )
    }

    // ------------------------------------------------------------------ apply

    /** Required services: slots + locale for the card, remote for settings invalidation. */
    const inject = ['slots', 'locale', 'remote']

    /**
     * Mount the dsh-mem0 configuration card. Failure policy mirrors the other
     * external browser plugins: a mount problem is logged, never thrown — the
     * web shell fails the whole boot when a plugin apply throws.
     * @param ctx - the browser plugin context.
     */
    function apply(ctx) {
      try {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-mem0: card dictionaries')
        const scope = new RouteScope()
        const controller = new Mem0CardController(scope)
        scope.load()
        // Live-sync: the host forwards settings/document-updated for every
        // namespace, so an external edit (or another window's save) refreshes.
        ctx.effect(
          () =>
            ctx.remote.$on('settings/document-updated', (namespace) => {
              if (namespace === undefined || namespace === NS) scope.load()
            }),
          'dsh-mem0: settings invalidation',
        )
        ctx.effect(
          () =>
            ctx.slots.inject('settings.plugin.item', () =>
              ctx.slots.register(
                {
                  name: 'settings.plugin.item',
                  id: 'mem0',
                  order: 100,
                  locale: NS,
                  inject: () => controller.inject(),
                },
                Mem0Card,
              ),
            ),
          'dsh-mem0: settings card',
        )
      } catch (error) {
        console.warn('[dsh-mem0] settings card failed to mount:', error)
      }
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
