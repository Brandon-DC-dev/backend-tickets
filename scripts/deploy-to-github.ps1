# =============================================================================
# Script: Inicializar repo local y subirlo a GitHub (rama main)
# Repo:   https://github.com/Brandon-DC-dev/backend-tickets.git
# Uso:    .\scripts\deploy-to-github.ps1
# =============================================================================

$ErrorActionPreference = "Stop"
$RepoDir   = "C:\Users\Soporte\Desarrollos\backend-supabase"
$RemoteUrl = "https://github.com/Brandon-DC-dev/backend-tickets.git"
$Branch    = "main"

Write-Host "`n=== Cambiando a: $RepoDir ===" -ForegroundColor Cyan
Set-Location $RepoDir

# 1) ¿Ya es un repo?
$isRepo = Test-Path ".git"
if (-not $isRepo) {
    Write-Host "[1/8] Inicializando repo local con rama '$Branch'..." -ForegroundColor Yellow
    git init -b $Branch
} else {
    Write-Host "[1/8] Repo local ya existe." -ForegroundColor Green
}

# 2) Configurar identidad local (solo en este repo)
Write-Host "[2/8] Configurando identidad de commit..." -ForegroundColor Yellow
git config user.email  "deploy@local"  2>$null
git config user.name   "Vercel Deploy Bot" 2>$null

# 3) Manejar remote origin (robusto: funciona aunque origin no exista)
Write-Host "[3/8] Configurando remote origin..." -ForegroundColor Yellow
$existing = $null
try {
    $remoteList = git remote -v 2>$null
    if ($remoteList) {
        $line = $remoteList | Where-Object { $_ -match '^origin\s' } | Select-Object -First 1
        if ($line) { $existing = ($line -split '\s+')[1] }
    }
} catch { $existing = $null }
if ($existing -and $existing -ne $RemoteUrl) {
    Write-Host "  Origin apunta a '$existing', se reemplaza por la URL nueva." -ForegroundColor Yellow
    git remote remove origin
}
if (-not $existing) {
    git remote add origin $RemoteUrl
}
$finalRemote = (git remote -v | Where-Object { $_ -match '^origin\s' } | Select-Object -First 1) -split '\s+' | Select-Object -Index 1
Write-Host "  Remote: $finalRemote" -ForegroundColor Green

# 4) Validar .gitignore
Write-Host "[4/8] Comprobando que .gitignore bloquea .env..." -ForegroundColor Yellow
$required = @(".env", "node_modules/", ".vercel", "*.log")
foreach ($p in $required) {
    if (Select-String -Path ".gitignore" -Pattern ([regex]::Escape($p)) -SimpleMatch -Quiet) {
        Write-Host "  OK: '$p' esta ignorado" -ForegroundColor Green
    } else {
        Write-Host "  WARN: '$p' NO esta en .gitignore" -ForegroundColor Red
    }
}

# 5) Safety check: .env NO debe estar tracked ni staged
Write-Host "[5/8] Verificando que .env NO sera commiteado..." -ForegroundColor Yellow
$tracked = git ls-files | Select-String -Pattern '^\.env$|\.env$' -CaseSensitive:$false
if ($tracked) {
    Write-Host "  CRITICAL: .env esta siendo tracked. Ejecutando untrack inmediato..." -ForegroundColor Red
    git rm --cached .env 2>$null
} else {
    Write-Host "  OK: .env no esta tracked" -ForegroundColor Green
}

# 6) Stagear SOLO archivos seguros (nunca 'git add .')
Write-Host "[6/8] Stageando archivos explicitos..." -ForegroundColor Yellow
git add vercel.json
git add package.json
git add pnpm-lock.yaml
git add README.md
git add .gitignore
git add .env.example
git add src/

Write-Host "  Archivos en staging:" -ForegroundColor Cyan
git status --short

$staged = git diff --cached --name-only
if ($staged | Select-String -Pattern '^\.env$|\.env$' -CaseSensitive:$false) {
    Write-Host "`nCRITICAL: .env quedo staged. Cancelando." -ForegroundColor Red
    git reset HEAD .env
    exit 1
}

# 7) Commit (safe even when HEAD does not exist yet)
Write-Host "`n[7/8] Creando commit..." -ForegroundColor Yellow
$hasCommits = $false
try {
    $ref = git rev-parse --verify HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $ref) { $hasCommits = $true }
} catch { $hasCommits = $false }
if ($hasCommits) {
    Write-Host "  Ya hay commits previos; creando uno nuevo con los cambios." -ForegroundColor Yellow
} else {
    Write-Host "  Primer commit del repo." -ForegroundColor Green
}

git commit -m "feat: initial backend with Express + Supabase, ready for Vercel serverless deploy"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Nothing to commit (puede que ya este todo commiteado). Continuando..." -ForegroundColor Yellow
    # Reset last exit code so the next push is not poisoned by this
    $LASTEXITCODE = 0
}

# 8) Push
Write-Host "`n[8/8] Pusheando a origin/$Branch ..." -ForegroundColor Yellow
git push -u origin $Branch
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nPush fallo. Si el remoto esta vacio y se quejo de 'non-fast-forward', prueba:" -ForegroundColor Yellow
    Write-Host "  git push -u origin $Branch --force-with-lease" -ForegroundColor Cyan
    exit 1
}

Write-Host "`n=== Listo ===" -ForegroundColor Green
Write-Host "Repo: $RemoteUrl" -ForegroundColor Cyan
Write-Host "Branch: $Branch" -ForegroundColor Cyan
git log -1 --oneline
