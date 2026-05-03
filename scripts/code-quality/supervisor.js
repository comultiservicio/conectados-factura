#!/usr/bin/env node
/**
 * Code Supervisor Mejorado
 * 
 * Funcionalidades:
 * - Análisis ESLint con reglas personalizadas
 * - Verificación de vulnerabilidades (npm audit + Snyk)
 * - Métricas de complejidad y mantenibilidad
 * - Verificación de performance (carga de módulos, tamaño de bundle)
 * - Reporte de deuda técnica
 * - Integración con GitHub Actions
 * 
 * @module code-quality/supervisor
 */

const { execSync, exec } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const glob = require('glob');

// ============================================
// CONFIGURACIÓN
// ============================================
const CONFIG = {
  // Umbrales de calidad
  THRESHOLDS: {
    complexity: 10,
    maintainability: 70,
    coverage: 80,
    bundleSize: 500, // KB
    duplication: 5, // porcentaje
    eslintErrors: 0,
    eslintWarnings: 10,
    auditVulnerabilities: 0
  },

  // Rutas a analizar
  PATHS: {
    backend: 'backend/src',
    frontend: 'frontend/src',
    mobile: 'mobile/src',
    tests: ['**/*.test.ts', '**/*.spec.ts'],
    exclude: ['node_modules', 'dist', 'build', '.git', 'coverage']
  },

  // Reportes
  REPORTS_DIR: './reports/code-quality',
  
  // Configuración de herramientas
  ESLINT: {
    configFile: '.eslintrc.js',
    extensions: ['.ts', '.tsx', '.js', '.jsx']
  },

  // GitHub Actions integration
  GITHUB: {
    enabled: process.env.CI === 'true',
    outputPath: process.env.GITHUB_OUTPUT,
    summaryPath: process.env.GITHUB_STEP_SUMMARY
  }
}};

// ============================================
// CODE SUPERVIOR CLASS
// ============================================
class CodeSupervisor {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      summary: {
        status: 'passed',
        score: 0,
        totalIssues: 0,
        thresholdsPassed: 0,
        thresholdsFailed: 0
      },
      eslint: null,
      security: null,
      complexity: null,
      coverage: null,
      performance: null,
      duplication: null,
      git: null
    };
    
    this.reporters = [];
  }

  /**
   * Ejecuta todas las verificaciones
   */
  async run() {
    console.log('🔍 Code Supervisor - Análisis de Calidad de Código');
    console.log('================================================\n');

    const startTime = Date.now();

    try {
      // 1. ESLint Analysis
      await this.runESLint();

      // 2. Security Audit (npm audit + Snyk)
      await this.runSecurityAudit();

      // 3. Complexity Analysis
      await this.analyzeComplexity();

      // 4. Test Coverage
      await this.checkCoverage();

      // 5. Performance Analysis
      await this.analyzePerformance();

      // 6. Code Duplication
      await this.checkDuplication();

      // 7. Git Analysis (cambios recientes)
      await this.analyzeGitHistory();

      // 8. Calcular score final
      this.calculateScore();

      // 9. Generar reportes
      await this.generateReports();

      // 10. Output para GitHub Actions
      if (CONFIG.GITHUB.enabled) {
        await this.githubOutput();
      }

      const duration = Date.now() - startTime;
      
      console.log('\n================================================');
      console.log(`📊 Score de calidad: ${this.results.summary.score}/100`);
      console.log(`⏱️  Duración: ${duration}ms`);
      console.log(`📁 Reportes guardados en: ${CONFIG.REPORTS_DIR}`);
      console.log('================================================\n');

      return this.results.summary.status === 'passed' ? 0 : 1;

    } catch (error) {
      console.error('❌ Error en Code Supervisor:', error);
      return 1;
    }
  }

  /**
   * Ejecuta ESLint con análisis detallado
   */
  async runESLint() {
    console.log('📏 Ejecutando ESLint...');

    try {
      // Verificar configuración
      const hasConfig = [
        '.eslintrc.js',
        '.eslintrc.json',
        '.eslintrc'
      ].some(f => fsSync.existsSync(f));

      if (!hasConfig) {
        console.log('   ⚠️ No se encontró configuración de ESLint');
        return;
      }

      // Ejecutar ESLint con formato JSON
      const cmd = `npx eslint ${CONFIG.PATHS.backend} ${CONFIG.PATHS.frontend} --ext .ts,.tsx,.js,.jsx --format json`;
      
      let output;
      try {
        output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (e) {
        output = e.stdout || '[]';
      }

      const eslintResults = JSON.parse(output);

      // Analizar resultados
      let errors = 0;
      let warnings = 0;
      const issuesByRule = {};
      const issuesByFile = {};

      for (const file of eslintResults) {
        const filePath = path.relative('.', file.filePath);
        issuesByFile[filePath] = { errors: 0, warnings: 0 };

        for (const message of file.messages) {
          if (message.severity === 2) {
            errors++;
            issuesByFile[filePath].errors++;
          } else {
            warnings++;
            issuesByFile[filePath].warnings++;
          }

          const rule = message.ruleId || 'unknown';
          issuesByRule[rule] = (issuesByRule[rule] || 0) + 1;
        }
      }

      this.results.eslint = {
        errors,
        warnings,
        issuesByRule,
        issuesByFile,
        thresholdPassed: errors === CONFIG.THRESHOLDS.eslintErrors && 
                        warnings <= CONFIG.THRESHOLDS.eslintWarnings
      };

      console.log(`   ✓ ESLint: ${errors} errores, ${warnings} advertencias`);

    } catch (error) {
      console.error('   ❌ Error ejecutando ESLint:', error.message);
      this.results.eslint = { error: error.message };
    }
  }

  /**
   * Verificación de seguridad
   */
  async runSecurityAudit() {
    console.log('🔒 Ejecutando análisis de seguridad...');

    const securityResults = {
      npmAudit: null,
      snyk: null,
      thresholdPassed: true
    };

    // 1. npm audit
    try {
      const auditOutput = execSync('npm audit --json 2>/dev/null || true', { 
        encoding: 'utf8',
        cwd: 'backend'
      });

      if (auditOutput) {
        const audit = JSON.parse(auditOutput);
        
        const critical = audit.metadata?.vulnerabilities?.critical || 0;
        const high = audit.metadata?.vulnerabilities?.high || 0;
        const moderate = audit.metadata?.vulnerabilities?.moderate || 0;
        const low = audit.metadata?.vulnerabilities?.low || 0;

        securityResults.npmAudit = {
          critical,
          high,
          moderate,
          low,
          total: critical + high + moderate + low
        };

        console.log(`   ✓ npm audit: ${critical} críticas, ${high} altas, ${moderate} moderadas`);
      }
    } catch (error) {
      console.log('   ⚠️ npm audit no disponible');
    }

    // 2. Snyk (si está configurado)
    if (process.env.SNYK_TOKEN) {
      try {
        execSync('npx snyk auth ' + process.env.SNYK_TOKEN, { stdio: 'pipe' });
        const snykOutput = execSync('npx snyk test --json 2>/dev/null || true', { 
          encoding: 'utf8',
          cwd: 'backend'
        });

        if (snykOutput) {
          const snyk = JSON.parse(snykOutput);
          
          securityResults.snyk = {
            vulnerabilities: snyk.vulnerabilities?.length || 0,
            summary: snyk.summary
          };

          console.log(`   ✓ Snyk: ${securityResults.snyk.vulnerabilities} vulnerabilidades`);
        }
      } catch (error) {
        console.log('   ⚠️ Snyk no disponible');
      }
    }

    // Verificar umbrales
    const totalHigh = (securityResults.npmAudit?.critical || 0) + 
                      (securityResults.npmAudit?.high || 0);
    securityResults.thresholdPassed = totalHigh === 0;

    this.results.security = securityResults;
  }

  /**
   * Análisis de complejidad
   */
  async analyzeComplexity() {
    console.log('📈 Analizando complejidad del código...');

    try {
      // Instalar complexity-report si no existe
      try {
        execSync('npm list -g complexity-report 2>/dev/null || npm install -g complexity-report');
      } catch (e) {}

      // Analizar archivos JavaScript/TypeScript
      const files = glob.sync('backend/src/**/*.js');
      const results = [];

      for (const file of files) {
        try {
          const report = execSync(`npx cr ${file} --format json`, { encoding: 'utf8' });
          const data = JSON.parse(report);
          
          results.push({
            file,
            complexity: data.aggregate.cyclomatic,
            maintainability: data.maintainability
          });
        } catch (e) {}
      }

      // Calcular promedios
      const avgComplexity = results.reduce((sum, r) => sum + r.complexity, 0) / results.length;
      const avgMaintainability = results.reduce((sum, r) => sum + r.maintainability, 0) / results.length;

      // Archivos con alta complejidad
      const highComplexity = results.filter(r => r.complexity > CONFIG.THRESHOLDS.complexity);

      this.results.complexity = {
        average: avgComplexity.toFixed(2),
        maintainability: avgMaintainability.toFixed(2),
        highComplexityFiles: highComplexity,
        totalFiles: results.length,
        thresholdPassed: highComplexity.length === 0
      };

      console.log(`   ✓ Complejidad promedio: ${avgComplexity.toFixed(2)}`);
      console.log(`   ✓ Mantenibilidad: ${avgMaintainability.toFixed(2)}`);
      console.log(`   ⚠️ Archivos con alta complejidad: ${highComplexity.length}`);

    } catch (error) {
      console.log('   ⚠️ Análisis de complejidad no disponible');
      this.results.complexity = { error: error.message };
    }
  }

  /**
   * Verificar cobertura de tests
   */
  async checkCoverage() {
    console.log('🧪 Verificando cobertura de tests...');

    try {
      // Buscar archivos de cobertura
      const coveragePath = 'backend/coverage/coverage-summary.json';
      
      if (!fsSync.existsSync(coveragePath)) {
        console.log('   ⚠️ No se encontró reporte de cobertura');
        return;
      }

      const coverage = JSON.parse(await fs.readFile(coveragePath, 'utf8'));
      
      const metrics = {
        lines: coverage.total.lines.pct,
        statements: coverage.total.statements.pct,
        functions: coverage.total.functions.pct,
        branches: coverage.total.branches.pct
      };

      const minCoverage = Math.min(...Object.values(metrics));

      this.results.coverage = {
        metrics,
        minCoverage,
        thresholdPassed: minCoverage >= CONFIG.THRESHOLDS.coverage
      };

      console.log(`   ✓ Cobertura mínima: ${minCoverage.toFixed(1)}%`);

    } catch (error) {
      console.log('   ⚠️ No se pudo verificar cobertura');
    }
  }

  /**
   * Análisis de performance
   */
  async analyzePerformance() {
    console.log('⚡ Analizando performance...');

    try {
      // Verificar tamaño del bundle si existe
      const bundlePath = 'frontend/dist';
      let bundleSize = 0;

      if (fsSync.existsSync(bundlePath)) {
        const files = glob.sync(`${bundlePath}/**/*.js`);
        
        for (const file of files) {
          const stats = await fs.stat(file);
          bundleSize += stats.size;
        }

        bundleSize = bundleSize / 1024; // KB
      }

      // Análisis de imports (tree-shaking)
      const importAnalysis = this.analyzeImports();

      this.results.performance = {
        bundleSize: bundleSize.toFixed(2),
        bundleSizePassed: bundleSize < CONFIG.THRESHOLDS.bundleSize,
        importAnalysis,
        thresholdPassed: bundleSize < CONFIG.THRESHOLDS.bundleSize
      };

      console.log(`   ✓ Tamaño del bundle: ${bundleSize.toFixed(2)} KB`);

    } catch (error) {
      console.log('   ⚠️ Análisis de performance no disponible');
    }
  }

  /**
   * Analiza imports para detectar problemas de tree-shaking
   */
  analyzeImports() {
    const issues = [];
    
    // Buscar imports de lodash sin especificar módulo
    const files = glob.sync('frontend/src/**/*.{ts,tsx}');
    
    for (const file of files) {
      const content = fsSync.readFileSync(file, 'utf8');
      
      // Detectar import { something } from 'lodash' (mala práctica)
      if (content.includes("from 'lodash'") && !content.includes("from 'lodash/")) {
        issues.push({
          file,
          issue: 'Import completo de lodash detectado',
          suggestion: 'Usar imports específicos: import { debounce } from "lodash/debounce"'
        });
      }
    }

    return issues;
  }

  /**
   * Verificar duplicación de código
   */
  async checkDuplication() {
    console.log('🔄 Verificando duplicación de código...');

    try {
      // Usar jscpd para detección de duplicación
      try {
        execSync('npm list -g jscpd 2>/dev/null || npm install -g jscpd');
      } catch (e) {}

      const output = execSync(
        `npx jscpd backend/src frontend/src --reporters json --output reports/jscpd.json --ignore "**/*.test.ts,**/*.spec.ts,**/node_modules/**"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      );

      const report = JSON.parse(await fs.readFile('reports/jscpd.json', 'utf8'))
        .catch(() => ({ statistics: { total: { percentage: 0 } } }));

      const duplication = report.statistics?.total?.percentage || 0;

      this.results.duplication = {
        percentage: duplication.toFixed(2),
        thresholdPassed: duplication < CONFIG.THRESHOLDS.duplication
      };

      console.log(`   ✓ Duplicación: ${duplication.toFixed(2)}%`);

    } catch (error) {
      console.log('   ⚠️ Análisis de duplicación no disponible');
    }
  }

  /**
   * Analizar historial de Git
   */
  async analyzeGitHistory() {
    console.log('📜 Analizando historial de Git...');

    try {
      // Cambios en la última semana
      const commits = execSync(
        'git log --oneline --since="7 days ago" | wc -l',
        { encoding: 'utf8' }
      ).trim();

      const contributors = execSync(
        'git log --since="7 days ago" --format="%an" | sort | uniq | wc -l',
        { encoding: 'utf8' }
      ).trim();

      const changedFiles = execSync(
        'git diff --name-only HEAD~7..HEAD | wc -l',
        { encoding: 'utf8' }
      ).trim();

      this.results.git = {
        commitsLastWeek: parseInt(commits),
        contributors: parseInt(contributors),
        changedFiles: parseInt(changedFiles)
      };

      console.log(`   ✓ Commits última semana: ${commits}`);
      console.log(`   ✓ Contribuidores: ${contributors}`);

    } catch (error) {
      console.log('   ⚠️ Análisis de Git no disponible');
    }
  }

  /**
   * Calcular score de calidad
   */
  calculateScore() {
    let score = 100;
    let passed = 0;
    let failed = 0;

    const checks = [
      { name: 'ESLint', result: this.results.eslint?.thresholdPassed },
      { name: 'Security', result: this.results.security?.thresholdPassed },
      { name: 'Complexity', result: this.results.complexity?.thresholdPassed },
      { name: 'Coverage', result: this.results.coverage?.thresholdPassed },
      { name: 'Performance', result: this.results.performance?.thresholdPassed },
      { name: 'Duplication', result: this.results.duplication?.thresholdPassed }
    ];

    for (const check of checks) {
      if (check.result === undefined) continue;
      
      if (check.result) {
        passed++;
      } else {
        failed++;
        score -= 15; // Penalización por check fallido
      }
    }

    // Penalización por errores ESLint
    if (this.results.eslint?.errors > 0) {
      score -= Math.min(this.results.eslint.errors * 2, 20);
    }

    // Bonus por mantenibilidad alta
    if (this.results.complexity?.maintainability > 80) {
      score += 5;
    }

    score = Math.max(0, Math.min(100, score));

    this.results.summary = {
      status: failed === 0 ? 'passed' : 'failed',
      score,
      totalIssues: this.results.eslint?.errors + this.results.eslint?.warnings || 0,
      thresholdsPassed: passed,
      thresholdsFailed: failed,
      checks
    };
  }

  /**
   * Generar reportes
   */
  async generateReports() {
    await this.ensureDir(CONFIG.REPORTS_DIR);

    // Reporte JSON
    await fs.writeFile(
      path.join(CONFIG.REPORTS_DIR, 'quality-report.json'),
      JSON.stringify(this.results, null, 2)
    );

    // Reporte HTML
    const htmlReport = this.generateHTMLReport();
    await fs.writeFile(
      path.join(CONFIG.REPORTS_DIR, 'quality-report.html'),
      htmlReport
    );

    // Reporte Markdown para GitHub
    const mdReport = this.generateMarkdownReport();
    await fs.writeFile(
      path.join(CONFIG.REPORTS_DIR, 'quality-report.md'),
      mdReport
    );
  }

  /**
   * Generar reporte HTML
   */
  generateHTMLReport() {
    const r = this.results;
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Code Quality Report - Conectados Factura+</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
    .header { text-align: center; margin-bottom: 30px; }
    .score { font-size: 72px; font-weight: bold; }
    .score.passed { color: #22c55e; }
    .score.failed { color: #ef4444; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 30px 0; }
    .metric { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
    .metric-value { font-size: 36px; font-weight: bold; }
    .metric-label { color: #666; margin-top: 5px; }
    .checks { margin-top: 30px; }
    .check { padding: 15px; margin: 10px 0; border-radius: 6px; display: flex; justify-content: space-between; }
    .check.passed { background: #dcfce7; border-left: 4px solid #22c55e; }
    .check.failed { background: #fee2e2; border-left: 4px solid #ef4444; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e5e5; text-align: center; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Code Quality Report</h1>
      <p>${new Date().toLocaleString()}</p>
      <div class="score ${r.summary.status}">${r.summary.score}</div>
    </div>
    
    <div class="summary">
      <div class="metric">
        <div class="metric-value">${r.eslint?.errors || 0}</div>
        <div class="metric-label">ESLint Errors</div>
      </div>
      <div class="metric">
        <div class="metric-value">${r.security?.npmAudit?.high || 0}</div>
        <div class="metric-label">High Vulnerabilities</div>
      </div>
      <div class="metric">
        <div class="metric-value">${r.complexity?.average || 0}</div>
        <div class="metric-label">Avg Complexity</div>
      </div>
      <div class="metric">
        <div class="metric-value">${r.coverage?.minCoverage?.toFixed(1) || 0}%</div>
        <div class="metric-label">Min Coverage</div>
      </div>
    </div>
    
    <div class="checks">
      <h2>Quality Checks</h2>
      ${r.summary.checks.map(c => `
        <div class="check ${c.result ? 'passed' : 'failed'}">
          <span>${c.name}</span>
          <span>${c.result ? '✅' : '❌'}</span>
        </div>
      `).join('')}
    </div>
    
    <div class="footer">
      Generated by Code Supervisor | Conectados Factura+
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Generar reporte Markdown
   */
  generateMarkdownReport() {
    const r = this.results;
    
    return `# Code Quality Report - Conectados Factura+

**Timestamp:** ${new Date().toLocaleString()}  
**Status:** ${r.summary.status === 'passed' ? '✅ PASSED' : '❌ FAILED'}  
**Score:** ${r.summary.score}/100

## Summary

| Metric | Value |
|--------|-------|
| ESLint Errors | ${r.eslint?.errors || 0} |
| ESLint Warnings | ${r.eslint?.warnings || 0} |
| Security Issues | ${r.security?.npmAudit?.total || 0} |
| Avg Complexity | ${r.complexity?.average || 'N/A'} |
| Code Coverage | ${r.coverage?.minCoverage?.toFixed(1) || 'N/A'}% |
| Bundle Size | ${r.performance?.bundleSize || 'N/A'} KB |

## Quality Checks

${r.summary.checks.map(c => `- ${c.result ? '✅' : '❌'} ${c.name}`).join('\n')}

## Thresholds

| Check | Status |
|-------|--------|
| ESLint Errors ≤ ${CONFIG.THRESHOLDS.eslintErrors} | ${r.eslint?.thresholdPassed ? '✅' : '❌'} |
| ESLint Warnings ≤ ${CONFIG.THRESHOLDS.eslintWarnings} | ${r.eslint?.thresholdPassed ? '✅' : '❌'} |
| No High Vulnerabilities | ${r.security?.thresholdPassed ? '✅' : '❌'} |
| Complexity < ${CONFIG.THRESHOLDS.complexity} | ${r.complexity?.thresholdPassed ? '✅' : '❌'} |
| Coverage ≥ ${CONFIG.THRESHOLDS.coverage}% | ${r.coverage?.thresholdPassed ? '✅' : '❌'} |
| Bundle Size < ${CONFIG.THRESHOLDS.bundleSize}KB | ${r.performance?.thresholdPassed ? '✅' : '❌'} |

---
*Generated by Code Supervisor*
`;
  }

  /**
   * Output para GitHub Actions
   */
  async githubOutput() {
    if (CONFIG.GITHUB.outputPath) {
      const output = `score=${this.results.summary.score}\nstatus=${this.results.summary.status}\n`;
      await fs.appendFile(CONFIG.GITHUB.outputPath, output);
    }

    if (CONFIG.GITHUB.summaryPath) {
      const summary = this.generateMarkdownReport();
      await fs.appendFile(CONFIG.GITHUB.summaryPath, summary);
    }
  }

  /**
   * Helper para crear directorios
   */
  async ensureDir(dir) {
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
  }
}

// ============================================
// EJECUCIÓN
// ============================================

if (require.main === module) {
  const supervisor = new CodeSupervisor();
  
  supervisor.run().then(exitCode => {
    process.exit(exitCode);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = CodeSupervisor;
