import { useState } from 'react'
import { useStore } from '../store'
import { useVersionCheck } from '../hooks/useVersionCheck'
import HelpModal from './HelpModal'

export default function Header() {
  const setShowSettings = useStore((s) => s.setShowSettings)
  const quota = useStore((s) => s.quota)
  const apiKey = useStore((s) => s.settings.apiKey)
  const { hasUpdate, latestRelease, dismiss } = useVersionCheck()
  const [showHelp, setShowHelp] = useState(false)
  const [showGuide, setShowGuide] = useState(true)

  const isFreeMode = !apiKey

  return (
    <header data-no-drag-select className="safe-area-top sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur border-b border-gray-200 dark:border-white/[0.08]">
      {/* Promo banner */}
      {isFreeMode && showGuide && (
        <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white text-xs py-2 px-4 flex items-center justify-center gap-2 relative">
          <span>
            <a href="https://moyuu.cc" target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2">Moyuu AI</a>
            {' '}注册即送 <strong>100 张</strong> GPT-Image2 免费额度，仅 <strong>¥0.05/张</strong>
          </span>
          <a href="https://moyuu.cc" target="_blank" rel="noopener noreferrer" className="ml-1 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 transition font-medium whitespace-nowrap">
            立即注册
          </a>
          <button onClick={() => setShowGuide(false)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/20 rounded">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      <div className="safe-area-x safe-header-inner max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-start gap-1">
          <h1 className="text-lg font-bold tracking-tight">
            <a
              href="https://github.com/CookSleep/gpt_image_playground"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-800 dark:text-gray-100 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              GPT Image Playground
            </a>
          </h1>
          {hasUpdate && latestRelease && (
            <a
              href={latestRelease.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={dismiss}
              className="px-1.5 py-0.5 mt-0.5 rounded border border-red-500/30 text-[10px] font-bold bg-red-500 text-white hover:bg-red-600 transition-colors animate-fade-in leading-none"
              title={`新版本 ${latestRelease.tag}`}
            >
              NEW
            </a>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Quota display in free mode */}
          {isFreeMode && quota && (
            <div className="flex items-center gap-1.5">
              {quota.banned ? (
                <span className="text-[11px] px-2 py-1 rounded-lg font-medium bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400">
                  账户已禁用
                </span>
              ) : (
                <span
                  className={`text-[11px] px-2 py-1 rounded-lg font-medium ${
                    quota.userRemaining > 0
                      ? 'bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400'
                      : 'bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400'
                  }`}
                  title={`全站剩余: ${quota.globalRemaining}/${quota.globalLimit}`}
                >
                  免费 {quota.userRemaining}/{quota.userLimit}
                </span>
              )}
              {!quota.hasEmail && (
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); useStore.getState().setShowSettings(true) }}
                  className="text-[10px] text-blue-500 hover:text-blue-600 dark:text-blue-400 whitespace-nowrap"
                >
                  绑定邮箱得更多
                </a>
              )}
            </div>
          )}

          {/* Own key indicator */}
          {!isFreeMode && (
            <span className="text-[11px] px-2 py-1 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 font-medium">
              自有 Key
            </span>
          )}

          <a
            href="https://moyuu.cc"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors font-medium"
            title="前往 Moyuu AI 注册获取 API Key"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            获取 Key
          </a>
          <button
            onClick={() => setShowHelp(true)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
            title="操作指南"
          >
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
            </svg>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
            title="设置"
          >
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </header>
  )
}
