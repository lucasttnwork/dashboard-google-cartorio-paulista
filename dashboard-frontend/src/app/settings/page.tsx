"use client"

import { AppShell } from '@/components/shell/app-shell'
import { Settings, User, Bell, Shield, Palette, Save, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ChangePasswordDialog } from '@/components/settings/change-password-dialog'
import { ClearCacheDialog } from '@/components/settings/clear-cache-dialog'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'

export default function SettingsPage() {
  // Estados dos switches
  const [settings, setSettings] = useState({
    notifications: true,
    weeklyReport: true,
    compactView: false,
    autoRefresh: true,
    twoFactor: false,
    dataExport: true,
  })

  // Estados dos dialogs
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [clearCacheOpen, setClearCacheOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Carregar configurações do localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('user-preferences')
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings)
        setSettings(prev => ({ ...prev, ...parsed }))
      } catch (error) {
        console.error('Erro ao carregar configurações:', error)
      }
    }
  }, [])

  // Handler para switches
  const handleSettingChange = (key: keyof typeof settings, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  // Handler para salvar configurações
  const handleSaveSettings = async () => {
    setIsSaving(true)

    try {
      // Simular chamada API
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Salvar no localStorage
      localStorage.setItem('user-preferences', JSON.stringify(settings))

      toast.success('Configurações salvas com sucesso!', {
        description: 'Suas preferências foram atualizadas.',
        duration: 3000,
      })

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)

    } catch (error) {
      console.error('Erro ao salvar configurações:', error)
      toast.error('Erro ao salvar configurações', {
        description: 'Tente novamente em alguns instantes.',
        duration: 4000,
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
            <p className="text-muted-foreground">
              Personalize sua experiência no dashboard
            </p>
          </div>
        </div>

        {/* Settings Sections */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Profile Settings */}
          <div className="rounded-2xl border bg-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Perfil</h3>
                <p className="text-sm text-muted-foreground">Gerencie suas informações pessoais</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="notifications" className="text-sm font-medium">
                    Notificações por email
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Receba alertas sobre novas avaliações
                  </p>
                </div>
                <Switch
                  id="notifications"
                  checked={settings.notifications}
                  onCheckedChange={(checked) => handleSettingChange('notifications', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="weekly-report" className="text-sm font-medium">
                    Relatório semanal
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Receba resumo semanal das métricas
                  </p>
                </div>
                <Switch
                  id="weekly-report"
                  checked={settings.weeklyReport}
                  onCheckedChange={(checked) => handleSettingChange('weeklyReport', checked)}
                />
              </div>
            </div>
          </div>

          {/* Appearance Settings */}
          <div className="rounded-2xl border bg-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Palette className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Aparência</h3>
                <p className="text-sm text-muted-foreground">Personalize a interface do dashboard</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="compact-view" className="text-sm font-medium">
                    Visualização compacta
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Reduza o espaçamento nas tabelas
                  </p>
                </div>
                <Switch
                  id="compact-view"
                  checked={settings.compactView}
                  onCheckedChange={(checked) => handleSettingChange('compactView', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-refresh" className="text-sm font-medium">
                    Atualização automática
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Atualize dados automaticamente
                  </p>
                </div>
                <Switch
                  id="auto-refresh"
                  checked={settings.autoRefresh}
                  onCheckedChange={(checked) => handleSettingChange('autoRefresh', checked)}
                />
              </div>
            </div>
          </div>

          {/* Security Settings */}
          <div className="rounded-2xl border bg-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Segurança</h3>
                <p className="text-sm text-muted-foreground">Configure opções de segurança</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="two-factor" className="text-sm font-medium">
                    Autenticação de dois fatores
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Adicione uma camada extra de segurança
                  </p>
                </div>
                <Switch
                  id="two-factor"
                  checked={settings.twoFactor}
                  onCheckedChange={(checked) => handleSettingChange('twoFactor', checked)}
                />
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setChangePasswordOpen(true)}
              >
                Alterar senha
              </Button>
            </div>
          </div>

          {/* System Settings */}
          <div className="rounded-2xl border bg-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Settings className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Sistema</h3>
                <p className="text-sm text-muted-foreground">Configurações avançadas do sistema</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="data-export" className="text-sm font-medium">
                    Exportação de dados
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Permitir download de dados brutos
                  </p>
                </div>
                <Switch
                  id="data-export"
                  checked={settings.dataExport}
                  onCheckedChange={(checked) => handleSettingChange('dataExport', checked)}
                />
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setClearCacheOpen(true)}
              >
                Limpar cache
              </Button>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={handleSaveSettings}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                Salvando...
              </>
            ) : saveSuccess ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Salvo!
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar alterações
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Dialogs */}
      <ChangePasswordDialog
        open={changePasswordOpen}
        onOpenChange={setChangePasswordOpen}
      />
      <ClearCacheDialog
        open={clearCacheOpen}
        onOpenChange={setClearCacheOpen}
      />
    </AppShell>
  )
}
