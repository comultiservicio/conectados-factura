// scripts/supervisor-auto.js
/**
 * Supervisor Automático de Código
 * Realiza revisiones diarias automáticas del codebase
 * 
 * Funciones:
 * - Análisis estático con ESLint
 * - Revisión con IA de OpenAI/Anthropic (para cambios importantes)
 * - Tests automáticos
 * - Generación de reportes
 * - Alertas por email/Slack
 */

const { execSync, exec } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuración
const CONFIG = {
  // Umbrales para revisión con IA
  SIGNIFICANT_CHANGES_THRESHOLD: 100, // líneas modificadas
  COMPLEXITY_THRESHOLD: 15, // complejidad ciclomática
  
  // Rutas a revisar
  WATCH_PATHS: [
    'src',
    'backend/src',
    'mobile/src',
    'desktop/src'
  ],
  
  // Archivos a ignorar
  IGNORE_PATTERNS: [
    'node_modules',
    'dist',
    'build',
    '.git',
    '*.test.ts',
    '*.spec.ts'
  ],
  
  // Configuración de reportes
  REPORTS_DIR: './reports',
  MAX_REPORTS_HISTORY: 30, // días
  
  // Notificaciones
  SLACK_WEBHOOK: process.env.SLACK_WEBHOOK_URL,
  EMAIL_TO: process.env.SUPERVISOR_EMAIL,
  
  // OpenAI API para revisión IA
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY
};

class CodeSupervisor {
  constructor() {
    this.problemsFound = [];
    this.lastCheck = null;
    this.checkHistory = [];
    this.stats = {
      eslintErrors: 0,
      eslintWarnings: 0,
      testFailures: 0,
      coverage: 0,
      complexityScore: 0,
      changedFiles: 0,
      addedLines: 0,
      removedLines: 0
    };
  }

  /**
   * Ejecuta la revisión diaria automática
   */
  async dailyCheck() {
    console.log('🔍 Revisión automática diaria iniciada');
    console.log('⏰', new Date().toISOString());
    
    this.lastCheck = new Date();
    this.problemsFound = [];
    
    try {
      // 1. Análisis estático con ESLint
      await this.runESLint();
      
      // 2. Verificar si hay cambios significativos
      const hasSignificantChanges = await this.hasSignificantChanges();
      
      // 3. Revisión con IA (solo si cambios importantes)
      if (hasSignificantChanges && (CONFIG.OPENAI_API_KEY || CONFIG.ANTHROPIC_API_KEY)) {
        console.log('🤖 Cambios significativos detectados. Iniciando revisión IA...');
        await this.runAICodeReview();
      }
      
      // 4. Tests automáticos
      await this.runTests();
      
      // 5. Análisis de complejidad
      await this.analyzeComplexity();
      
      // 6. Generar reporte
      const report = await this.generateReport();
      
      // 7. Guardar historial
      await this.saveToHistory(report);
      
      // 8. Enviar notificaciones si hay problemas
      if (this.problemsFound.length > 0 || this.stats.eslintErrors > 0 || this.stats.testFailures > 0) {
        await this.sendNotifications(report);
      }
      
      console.log('✅ Revisión diaria completada');
      return report;
      
    } catch (error) {
      console.error('❌ Error en revisión diaria:', error);
      await this.logError(error);
      throw error;
    }
  }

  /**
   * Ejecuta ESLint y recopila resultados
   */
  async runESLint() {
    console.log('📏 Ejecutando ESLint...');
    
    try {
      // Verificar si existe configuración de ESLint
      const hasESLintConfig = fsSync.existsSync('.eslintrc.js') || 
                              fsSync.existsSync('.eslintrc.json') ||
                              fsSync.existsSync('.eslintrc');
      
      if (!hasESLintConfig) {
        console.log('⚠️  No se encontró configuración de ESLint, saltando...');
        return;
      }
      
      // Ejecutar ESLint con formato JSON para parsing
      const result = execSync(
        'npx eslint --ext .ts,.tsx,.js,.jsx src backend/src mobile/src desktop/src --format json',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      
      const eslintResults = JSON.parse(result);
      
      // Procesar resultados
      for (const file of eslintResults) {
        for (const message of file.messages) {
          if (message.severity === 2) {
            this.stats.eslintErrors++;
            this.problemsFound.push({
              type: 'eslint-error',
              file: file.filePath,
              line: message.line,
              column: message.column,
              message: message.message,
              rule: message.ruleId
            });
          } else if (message.severity === 1) {
            this.stats.eslintWarnings++;
          }
        }
      }
      
      console.log(`   ✓ ESLint: ${this.stats.eslintErrors} errores, ${this.stats.eslintWarnings} advertencias`);
      
    } catch (error) {
      // ESLint retorna código de error si hay errores
      if (error.stdout) {
        try {
          const eslintResults = JSON.parse(error.stdout);
          
          for (const file of eslintResults) {
            for (const message of file.messages) {
              if (message.severity === 2) {
                this.stats.eslintErrors++;
                this.problemsFound.push({
                  type: 'eslint-error',
                  file: file.filePath,
                  line: message.line,
                  column: message.column,
                  message: message.message,
                  rule: message.ruleId
                });
              } else if (message.severity === 1) {
                this.stats.eslintWarnings++;
              }
            }
          }
          
          console.log(`   ✓ ESLint: ${this.stats.eslintErrors} errores, ${this.stats.eslintWarnings} advertencias`);
        } catch (e) {
          console.error('   ❌ Error parseando resultados de ESLint:', e.message);
        }
      } else {
        console.log('   ⚠️  ESLint no disponible o sin configuración');
      }
    }
  }

  /**
   * Verifica si hay cambios significativos desde el último check
   */
  async hasSignificantChanges() {
    console.log('📊 Analizando cambios...');
    
    try {
      // Obtener última revisión guardada
      const lastCheckFile = path.join(CONFIG.REPORTS_DIR, '.last-check');
      let lastCheckCommit = null;
      
      try {
        lastCheckCommit = await fs.readFile(lastCheckFile, 'utf8');
      } catch (e) {
        // No hay check anterior, usar el commit más antiguo
        lastCheckCommit = execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf8' }).trim();
      }
      
      // Obtener diff stats desde último check
      const diffStats = execSync(
        `git diff --shortstat ${lastCheckCommit}..HEAD`,
        { encoding: 'utf8' }
      );
      
      // Parsear estadísticas
      const stats = this.parseDiffStats(diffStats);
      this.stats.changedFiles = stats.files;
      this.stats.addedLines = stats.additions;
      this.stats.removedLines = stats.deletions;
      
      console.log(`   ✓ Cambios: ${stats.files} archivos, +${stats.additions}/-${stats.deletions} líneas`);
      
      // Determinar si son cambios significativos
      const totalChanges = stats.additions + stats.deletions;
      return totalChanges > CONFIG.SIGNIFICANT_CHANGES_THRESHOLD;
      
    } catch (error) {
      console.error('   ❌ Error analizando cambios:', error.message);
      return false;
    }
  }

  /**
   * Parsea las estadísticas de git diff --shortstat
   */
  parseDiffStats(diffStats) {
    const match = diffStats.match(/(\d+) file[s]? changed, (\d+) insertion[s]?(\(\+\))?, (\d+) deletion[s]?(\(-\))?/);
    
    if (match) {
      return {
        files: parseInt(match[1], 10),
        additions: parseInt(match[2], 10),
        deletions: parseInt(match[4], 10)
      };
    }
    
    return { files: 0, additions: 0, deletions: 0 };
  }

  /**
   * Ejecuta revisión de código con IA (OpenAI/Anthropic)
   */
  async runAICodeReview() {
    console.log('🤖 Iniciando revisión con IA...');
    
    try {
      // Obtener archivos modificados importantes
      const changedFiles = this.getChangedFiles();
      const importantFiles = changedFiles.filter(f => 
        !f.includes('.test.') && 
        !f.includes('.spec.') &&
        (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js'))
      ).slice(0, 5); // Limitar a 5 archivos por revisión
      
      if (importantFiles.length === 0) {
        console.log('   ℹ️ No hay archivos importantes para revisar');
        return;
      }
      
      for (const file of importantFiles) {
        await this.reviewFileWithAI(file);
      }
      
    } catch (error) {
      console.error('   ❌ Error en revisión IA:', error.message);
    }
  }

  /**
   * Revisa un archivo específico con IA
   */
  async reviewFileWithAI(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      // Limitar tamaño para no exceder límites de API
      const maxLength = 4000;
      const truncatedContent = content.length > maxLength 
        ? content.substring(0, maxLength) + '\n// ... (truncado)' 
        : content;
      
      const prompt = `
Eres un experto desarrollador senior. Revisa este código TypeScript/JavaScript y proporciona:
1. Posibles bugs o problemas de seguridad
2. Sugerencias de optimización de rendimiento
3. Problemas de mantenibilidad o código limpio
4. Verificación de manejo de errores

Responde en formato JSON con un array de issues, cada uno con:
- severity: "high", "medium", "low"
- line: número de línea (aproximado)
- message: descripción del problema
- suggestion: cómo corregirlo

Código a revisar:
\`\`\`
${truncatedContent}
\`\`\`

Responde SOLO con el JSON, sin texto adicional.
`;

      let review;
      
      if (CONFIG.ANTHROPIC_API_KEY) {
        review = await this.callAnthropic(prompt);
      } else if (CONFIG.OPENAI_API_KEY) {
        review = await this.callOpenAI(prompt);
      } else {
        console.log('   ⚠️ No hay API keys configuradas para IA');
        return;
      }
      
      // Parsear y guardar resultados
      const issues = JSON.parse(review);
      
      for (const issue of issues) {
        this.problemsFound.push({
          type: 'ai-review',
          file: filePath,
          line: issue.line,
          severity: issue.severity,
          message: issue.message,
          suggestion: issue.suggestion,
          source: 'AI'
        });
      }
      
      console.log(`   ✓ ${filePath}: ${issues.length} problemas detectados por IA`);
      
    } catch (error) {
      console.error(`   ❌ Error revisando ${filePath}:`, error.message);
    }
  }

  /**
   * Llama a la API de Anthropic (Claude)
   */
  async callAnthropic(prompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    
    const data = await response.json();
    return data.content[0].text;
  }

  /**
   * Llama a la API de OpenAI
   */
  async callOpenAI(prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
    });
    
    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Ejecuta tests automáticos
   */
  async runTests() {
    console.log('🧪 Ejecutando tests...');
    
    try {
      // Verificar si hay tests configurados
      const hasJest = fsSync.existsSync('jest.config.js') || 
                      fsSync.existsSync('jest.config.ts');
      
      if (!hasJest) {
        console.log('   ⚠️ No se encontró configuración de Jest, saltando...');
        return;
      }
      
      // Ejecutar tests con cobertura
      const result = execSync(
        'npm test -- --coverage --json --outputFile=./coverage/result.json --silent',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      
      // Leer resultados
      const coverageData = JSON.parse(
        await fs.readFile('./coverage/result.json', 'utf8')
      );
      
      this.stats.testFailures = coverageData.numFailedTests;
      this.stats.coverage = coverageData.coverageMap 
        ? this.calculateAverageCoverage(coverageData.coverageMap)
        : 0;
      
      console.log(`   ✓ Tests: ${coverageData.numPassedTests} pasados, ${coverageData.numFailedTests} fallidos`);
      console.log(`   ✓ Cobertura: ${this.stats.coverage.toFixed(1)}%`);
      
    } catch (error) {
      // Tests fallaron
      if (fsSync.existsSync('./coverage/result.json')) {
        try {
          const coverageData = JSON.parse(
            await fs.readFile('./coverage/result.json', 'utf8')
          );
          this.stats.testFailures = coverageData.numFailedTests;
          
          console.log(`   ❌ Tests: ${coverageData.numFailedTests} fallidos`);
          
          // Registrar tests fallidos
          for (const test of coverageData.testResults) {
            for (const assertion of test.assertionResults) {
              if (assertion.status === 'failed') {
                this.problemsFound.push({
                  type: 'test-failure',
                  file: test.name,
                  message: assertion.title,
                  details: assertion.failureMessages?.[0] || 'Test fallido'
                });
              }
            }
          }
        } catch (e) {
          console.error('   ❌ Error ejecutando tests:', error.message);
        }
      } else {
        console.log('   ⚠️ Tests no disponibles');
      }
    }
  }

  /**
   * Calcula cobertura promedio
   */
  calculateAverageCoverage(coverageMap) {
    let total = 0;
    let count = 0;
    
    for (const file of Object.values(coverageMap)) {
      const branches = file.branchMap || {};
      const statements = file.statementMap || {};
      
      if (Object.keys(branches).length > 0) {
        // Calcular cobertura real
        const covered = Object.values(branches).filter(b => b.covered).length;
        total += (covered / Object.keys(branches).length) * 100;
        count++;
      }
    }
    
    return count > 0 ? total / count : 0;
  }

  /**
   * Analiza complejidad del código
   */
  async analyzeComplexity() {
    console.log('📈 Analizando complejidad...');
    
    try {
      // Usar complexity-report o similar si está disponible
      const result = execSync(
        'npx complexity-report --format json src/ 2>/dev/null || echo "{}"',
        { encoding: 'utf8' }
      );
      
      const complexity = JSON.parse(result);
      
      if (complexity.reports) {
        let highComplexityFiles = 0;
        
        for (const report of complexity.reports) {
          if (report.cyclomatic > CONFIG.COMPLEXITY_THRESHOLD) {
            highComplexityFiles++;
            this.problemsFound.push({
              type: 'high-complexity',
              file: report.path,
              complexity: report.cyclomatic,
              message: `Complejidad ciclomática: ${report.cyclomatic} (threshold: ${CONFIG.COMPLEXITY_THRESHOLD})`,
              suggestion: 'Considerar refactorizar en funciones más pequeñas'
            });
          }
        }
        
        console.log(`   ✓ Complejidad: ${highComplexityFiles} archivos con alta complejidad`);
      }
    } catch (error) {
      console.log('   ℹ️ Análisis de complejidad no disponible');
    }
  }

  /**
   * Genera reporte completo
   */
  async generateReport() {
    console.log('📝 Generando reporte...');
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        status: this.problemsFound.length === 0 && this.stats.eslintErrors === 0 
          ? '✅ PASSED' 
          : '❌ FAILED',
        totalProblems: this.problemsFound.length,
        eslintErrors: this.stats.eslintErrors,
        eslintWarnings: this.stats.eslintWarnings,
        testFailures: this.stats.testFailures,
        coverage: this.stats.coverage,
        changedFiles: this.stats.changedFiles,
        addedLines: this.stats.addedLines,
        removedLines: this.stats.removedLines
      },
      problems: this.problemsFound,
      stats: this.stats,
      recommendations: this.generateRecommendations()
    };
    
    // Guardar reporte como JSON
    const reportPath = path.join(CONFIG.REPORTS_DIR, `report-${Date.now()}.json`);
    await this.ensureDir(CONFIG.REPORTS_DIR);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    // Generar reporte HTML para visualización
    const htmlReport = this.generateHTMLReport(report);
    const htmlPath = path.join(CONFIG.REPORTS_DIR, 'latest-report.html');
    await fs.writeFile(htmlPath, htmlReport);
    
    // Actualizar último check
    const lastCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    await fs.writeFile(
      path.join(CONFIG.REPORTS_DIR, '.last-check'),
      lastCommit
    );
    
    console.log(`   ✓ Reporte guardado: ${reportPath}`);
    console.log(`   ✓ Reporte HTML: ${htmlPath}`);
    
    return report;
  }

  /**
   * Genera recomendaciones basadas en problemas encontrados
   */
  generateRecommendations() {
    const recommendations = [];
    
    if (this.stats.eslintErrors > 0) {
      recommendations.push(`Corregir ${this.stats.eslintErrors} errores de ESLint`);
    }
    
    if (this.stats.testFailures > 0) {
      recommendations.push(`Revisar y corregir ${this.stats.testFailures} tests fallidos`);
    }
    
    if (this.stats.coverage < 80) {
      recommendations.push(`Aumentar cobertura de tests (actual: ${this.stats.coverage.toFixed(1)}%)`);
    }
    
    const highComplexity = this.problemsFound.filter(p => p.type === 'high-complexity').length;
    if (highComplexity > 0) {
      recommendations.push(`Refactorizar ${highComplexity} archivos con alta complejidad`);
    }
    
    const securityIssues = this.problemsFound.filter(p => 
      p.message?.toLowerCase().includes('security') ||
      p.message?.toLowerCase().includes('vulnerable') ||
      p.message?.toLowerCase().includes('sql injection') ||
      p.message?.toLowerCase().includes('xss')
    );
    
    if (securityIssues.length > 0) {
      recommendations.push(`URGENTE: Revisar ${securityIssues.length} problemas de seguridad`);
    }
    
    return recommendations;
  }

  /**
   * Genera reporte HTML
   */
  generateHTMLReport(report) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Code Supervisor Report - ${new Date().toLocaleDateString()}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 30px; }
    .status { font-size: 48px; margin: 20px 0; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 30px 0; }
    .stat-card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 36px; font-weight: bold; color: #3b82f6; }
    .stat-label { color: #6b7280; margin-top: 5px; }
    .problems { margin-top: 30px; }
    .problem { padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid; }
    .problem.error { background: #fef2f2; border-color: #ef4444; }
    .problem.warning { background: #fffbeb; border-color: #f59e0b; }
    .problem.info { background: #eff6ff; border-color: #3b82f6; }
    .problem-file { font-weight: 600; color: #374151; }
    .problem-message { color: #4b5563; margin-top: 5px; }
    .recommendations { background: #f0fdf4; padding: 20px; border-radius: 8px; margin-top: 30px; }
    .recommendations h3 { color: #16a34a; margin-top: 0; }
    .recommendations ul { margin: 10px 0; }
    .recommendations li { margin: 5px 0; color: #374151; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔍 Code Supervisor Report</h1>
      <p>${new Date().toLocaleString()}</p>
      <div class="status">${report.summary.status}</div>
    </div>
    
    <div class="summary">
      <div class="stat-card">
        <div class="stat-value">${report.summary.totalProblems}</div>
        <div class="stat-label">Problemas Encontrados</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.summary.eslintErrors}</div>
        <div class="stat-label">Errores ESLint</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.summary.testFailures}</div>
        <div class="stat-label">Tests Fallidos</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.summary.coverage.toFixed(1)}%</div>
        <div class="stat-label">Cobertura</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${report.summary.changedFiles}</div>
        <div class="stat-label">Archivos Cambiados</div>
      </div>
    </div>
    
    <div class="problems">
      <h2>Problemas Detallados</h2>
      ${report.problems.map(p => `
        <div class="problem ${p.severity === 'high' ? 'error' : p.severity === 'medium' ? 'warning' : 'info'}">
          <div class="problem-file">${p.file}${p.line ? `:${p.line}` : ''}</div>
          <div class="problem-message">[${p.type.toUpperCase()}] ${p.message}</div>
          ${p.suggestion ? `<div style="color: #059669; margin-top: 8px;">💡 ${p.suggestion}</div>` : ''}
        </div>
      `).join('')}
    </div>
    
    <div class="recommendations">
      <h3>📋 Recomendaciones</h3>
      <ul>
        ${report.recommendations.map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Guarda reporte en historial
   */
  async saveToHistory(report) {
    const historyPath = path.join(CONFIG.REPORTS_DIR, 'history.json');
    let history = [];
    
    try {
      const existing = await fs.readFile(historyPath, 'utf8');
      history = JSON.parse(existing);
    } catch (e) {
      // No existe historial
    }
    
    history.push({
      date: report.timestamp,
      status: report.summary.status,
      problems: report.summary.totalProblems,
      coverage: report.summary.coverage
    });
    
    // Mantener solo últimos 30 días
    if (history.length > CONFIG.MAX_REPORTS_HISTORY) {
      history = history.slice(-CONFIG.MAX_REPORTS_HISTORY);
    }
    
    await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
  }

  /**
   * Envía notificaciones (Slack/Email)
   */
  async sendNotifications(report) {
    // Slack webhook
    if (CONFIG.SLACK_WEBHOOK) {
      try {
        await fetch(CONFIG.SLACK_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `Code Supervisor Alert - ${report.summary.status}`,
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: `🔍 Code Supervisor: ${report.summary.status}`
                }
              },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: `*Problemas:*\n${report.summary.totalProblems}` },
                  { type: 'mrkdwn', text: `*Cobertura:*\n${report.summary.coverage.toFixed(1)}%` },
                  { type: 'mrkdwn', text: `*Tests Fallidos:*\n${report.summary.testFailures}` },
                  { type: 'mrkdwn', text: `*ESLint Errors:*\n${report.summary.eslintErrors}` }
                ]
              }
            ]
          })
        });
        console.log('   ✓ Notificación Slack enviada');
      } catch (e) {
        console.error('   ❌ Error enviando a Slack:', e.message);
      }
    }
    
    // Email (simulado - requeriría integración con SendGrid/AWS SES)
    if (CONFIG.EMAIL_TO) {
      console.log(`   📧 Reporte listo para enviar a: ${CONFIG.EMAIL_TO}`);
    }
  }

  /**
   * Obtiene lista de archivos cambiados
   */
  getChangedFiles() {
    try {
      const output = execSync('git diff --name-only HEAD~5..HEAD', { encoding: 'utf8' });
      return output.split('\n').filter(f => f.trim());
    } catch (e) {
      return [];
    }
  }

  /**
   * Helpers
   */
  async ensureDir(dir) {
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async logError(error) {
    const errorLog = path.join(CONFIG.REPORTS_DIR, 'errors.log');
    const entry = `[${new Date().toISOString()}] ${error.message}\n${error.stack}\n\n`;
    await fs.appendFile(errorLog, entry);
  }
}

// ============================================================================
// EJECUCIÓN
// ============================================================================

// Si se ejecuta directamente
if (require.main === module) {
  const supervisor = new CodeSupervisor();
  
  supervisor.dailyCheck()
    .then(report => {
      console.log('\n' + '='.repeat(50));
      console.log('RESUMEN DE REVISIÓN');
      console.log('='.repeat(50));
      console.log('Estado:', report.summary.status);
      console.log('Problemas:', report.summary.totalProblems);
      console.log('Cobertura:', report.summary.coverage.toFixed(1) + '%');
      console.log('Tests Fallidos:', report.summary.testFailures);
      console.log('='.repeat(50));
      
      process.exit(report.summary.status === '✅ PASSED' ? 0 : 1);
    })
    .catch(err => {
      console.error('Error fatal:', err);
      process.exit(1);
    });
}

module.exports = CodeSupervisor;
