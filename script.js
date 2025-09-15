// ===============================================
// TEMPORIZADORES DE CASAS - SCRIPT OPTIMIZADO
// ===============================================

// Configuración global
const CONFIG = {
  TOTAL_CASAS: 12,
  DURACION_INICIAL: 35 * 60, // 35 minutos en segundos
  ALERTA_PREVIA: 10, // segundos antes del final
  ALERTA_NEGATIVA_1: -5, // 5 segundos después
  ALERTA_NEGATIVA_2: -10, // 10 segundos después
  LIMITE_NEGATIVO: -600, // 10 minutos negativos máximo
  SONIDO_BUCLES: 4 // veces que se repite el sonido
};

// Variables globales del sistema
let timers = Array(CONFIG.TOTAL_CASAS).fill(null);
let extended = Array(CONFIG.TOTAL_CASAS).fill(false);
let negatives = Array(CONFIG.TOTAL_CASAS).fill(false);
let startTimes = Array(CONFIG.TOTAL_CASAS).fill(null);
let totalDurations = Array(CONFIG.TOTAL_CASAS).fill(CONFIG.DURACION_INICIAL);

// Estados de alertas
let alertaPreviaPlayed = Array(CONFIG.TOTAL_CASAS).fill(false);
let alertaNegativa1Played = Array(CONFIG.TOTAL_CASAS).fill(false);
let alertaNegativa2Played = Array(CONFIG.TOTAL_CASAS).fill(false);

// ===============================================
// SISTEMA DE AUDIO MEJORADO
// ===============================================
class AudioManager {
  constructor() {
    this.alarmSound = document.getElementById("alarm-sound");
    this.alarmaUnicaSound = document.getElementById("alarma-unica-sound");
    
    // Crear sonidos con fallbacks
    this.alertStartSound = this.createAudioWithFallback([
      "/public/assets/alerta-inicio.mp3",
      "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+K2C5jx8Ll+rW2tYOT8cZE5+m9"
    ]);
    
    this.alertEndSound = this.createAudioWithFallback([
      "/public/assets/alerta-final.mp3",
      "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+K2C5jx8Ll+rW2tYOT8cZE5+m9"
    ]);

    this.activeIntervals = new Set();
    this.isPlaying = false;
  }

  createAudioWithFallback(sources) {
    const audio = new Audio();
    let currentIndex = 0;
    
    const tryNextSource = () => {
      if (currentIndex < sources.length) {
        audio.src = sources[currentIndex];
        currentIndex++;
      }
    };
    
    audio.addEventListener('error', tryNextSource);
    tryNextSource();
    
    return audio;
  }

  async playSoundLoop(audio, maxPlays = CONFIG.SONIDO_BUCLES) {
    if (this.isPlaying) return;
    
    this.isPlaying = true;
    let playCount = 0;
    
    const playNext = async () => {
      if (playCount >= maxPlays) {
        this.isPlaying = false;
        return;
      }
      
      try {
        audio.currentTime = 0;
        await audio.play();
        playCount++;
        
        const duration = (audio.duration || 1) * 1000 + 200;
        const timeoutId = setTimeout(playNext, duration);
        this.activeIntervals.add(timeoutId);
      } catch (error) {
        console.warn('Audio play failed:', error);
        this.isPlaying = false;
      }
    };
    
    playNext();
  }

  playAlertaUnica() {
    try {
      this.alarmaUnicaSound.currentTime = 0;
      this.alarmaUnicaSound.play().catch(e => console.warn('Alert sound failed:', e));
    } catch (error) {
      console.warn('Single alert failed:', error);
    }
  }

  playAlarmSound() {
    try {
      this.alarmSound.currentTime = 0;
      this.alarmSound.play().catch(e => console.warn('Alarm sound failed:', e));
    } catch (error) {
      console.warn('Alarm sound failed:', error);
    }
  }

  stopAllSounds() {
    this.isPlaying = false;
    
    // Limpiar todos los intervalos
    this.activeIntervals.forEach(id => clearTimeout(id));
    this.activeIntervals.clear();
    
    // Pausar todos los audios
    [this.alarmSound, this.alarmaUnicaSound, this.alertStartSound, this.alertEndSound]
      .forEach(audio => {
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
        }
      });
  }
}

// Instancia global del gestor de audio
const audioManager = new AudioManager();

// ===============================================
// FUNCIONES DE TIMER PRINCIPALES
// ===============================================

function startTimer(i, restoring = false) {
  try {
    // Limpiar timer existente
    if (timers[i]) {
      clearInterval(timers[i]);
      timers[i] = null;
    }
    
    // Parar todos los sonidos
    audioManager.stopAllSounds();
    
    // Resetear estados de alerta
    resetAlertStates(i);
    
    if (!restoring) {
      // Nuevo timer
      extended[i] = false;
      negatives[i] = false;
      startTimes[i] = Date.now();
      totalDurations[i] = CONFIG.DURACION_INICIAL;
    } else if (!startTimes[i]) {
      // Restaurando pero sin tiempo de inicio
      startTimes[i] = Date.now();
    }
    
    // Sonido de inicio
    audioManager.playSoundLoop(audioManager.alertStartSound);
    
    // Actualizar UI
    updateCardUI(i, true);
    
    // Iniciar el intervalo del timer
    timers[i] = setInterval(() => updateTimer(i), 1000);
    
    // Actualizar filtros y contador
    aplicarFiltros();
    actualizarContadorActivos();
    
    showToast(`Timer ${getNombreCasa(i)} iniciado`, 'success');
    
  } catch (error) {
    console.error(`Error starting timer ${i}:`, error);
    showToast('Error al iniciar timer', 'error');
  }
}

function updateTimer(i) {
  try {
    if (!startTimes[i]) return;
    
    const elapsed = Math.floor((Date.now() - startTimes[i]) / 1000);
    let remaining;
    
    if (!extended[i] && !negatives[i]) {
      // Timer normal
      remaining = totalDurations[i] - elapsed;
    } else {
      // Timer extendido o negativo
      remaining = -1 * (elapsed - totalDurations[i]);
    }
    
    // Manejar alertas
    handleTimerAlerts(i, remaining);
    
    // Manejar transiciones de estado
    if (!negatives[i]) {
      if (remaining <= 0 && !extended[i]) {
        // Timer llegó a cero
        audioManager.playAlarmSound();
        extended[i] = true;
        negatives[i] = true;
        startTimes[i] = Date.now();
        totalDurations[i] = 0;
        
        const timerElement = document.getElementById(`timer-${i}`);
        if (timerElement) timerElement.classList.add("text-red-500", "negative-timer");
        
        updateTimerDisplay(i, 0);
        saveTimerState(i, 0);
        showToast(`Timer ${getNombreCasa(i)} en negativo`, 'warning');
        return;
      }
      updateTimerDisplay(i, Math.max(remaining, 0));
      saveTimerState(i, Math.max(remaining, 0));
    } else {
      // Timer negativo
      updateTimerDisplay(i, remaining);
      saveTimerState(i, remaining);
      
      // Opcional: Auto-detener después del límite negativo (comentado para permitir negativos indefinidos)
      // if (remaining <= CONFIG.LIMITE_NEGATIVO) {
      //   stopTimer(i);
      //   audioManager.playSoundLoop(audioManager.alertEndSound);
      //   showToast(`Timer ${getNombreCasa(i)} detenido automáticamente`, 'warning');
      // }
    }
    
  } catch (error) {
    console.error(`Error updating timer ${i}:`, error);
  }
}

function handleTimerAlerts(i, remaining) {
  // Alerta previa (10 segundos antes del final del timer principal)
  if (!negatives[i] && remaining === CONFIG.ALERTA_PREVIA && !alertaPreviaPlayed[i]) {
    audioManager.playAlertaUnica();
    alertaPreviaPlayed[i] = true;
    showToast(`Timer ${getNombreCasa(i)}: 10 segundos restantes`, 'warning');
  }
  
  // Alertas en tiempo negativo (basadas en tiempo transcurrido desde el inicio del negativo)
  if (negatives[i]) {
    const elapsed = Math.floor((Date.now() - startTimes[i]) / 1000);
    
    // Alerta a los 5 segundos de tiempo negativo (-00:05)
    if (elapsed === 5 && !alertaNegativa1Played[i]) {
      audioManager.playAlertaUnica();
      alertaNegativa1Played[i] = true;
      showToast(`Timer ${getNombreCasa(i)}: -00:05`, 'warning');
    }
    
    // Alerta a los 10 segundos de tiempo negativo (-00:10)
    if (elapsed === 10 && !alertaNegativa2Played[i]) {
      audioManager.playAlertaUnica();
      alertaNegativa2Played[i] = true;
      showToast(`Timer ${getNombreCasa(i)}: -00:10`, 'warning');
    }
  }
}

function restartTimer(i) {
  try {
    clearInterval(timers[i]);
    resetTimerState(i);
    
    const timerElement = document.getElementById(`timer-${i}`);
    if (timerElement) {
      timerElement.classList.remove("text-red-500", "negative-timer");
    }
    
    updateTimerDisplay(i, CONFIG.DURACION_INICIAL);
    startTimer(i);
    
    showToast(`Timer ${getNombreCasa(i)} reiniciado`, 'success');
  } catch (error) {
    console.error(`Error restarting timer ${i}:`, error);
  }
}

function stopTimer(i) {
  try {
    // Limpiar intervalo
    if (timers[i]) {
      clearInterval(timers[i]);
      timers[i] = null;
    }
    
    // Resetear estados
    resetTimerState(i);
    
    // Parar sonidos
    audioManager.stopAllSounds();
    
    // Actualizar display
    const timerElement = document.getElementById(`timer-${i}`);
    if (timerElement) {
      timerElement.classList.remove("text-red-500", "negative-timer");
    }
    
    updateTimerDisplay(i, CONFIG.DURACION_INICIAL);
    
    // Guardar estado
    saveTimerState(i, CONFIG.DURACION_INICIAL, false);
    
    // Actualizar UI
    updateCardUI(i, false);
    
    // Actualizar filtros
    aplicarFiltros();
    actualizarContadorActivos();
    
    showToast(`Timer ${getNombreCasa(i)} detenido`, 'success');
    
  } catch (error) {
    console.error(`Error stopping timer ${i}:`, error);
  }
}

function detenerTodosTimers() {
  try {
    let detenidos = 0;
    
    for (let i = 0; i < CONFIG.TOTAL_CASAS; i++) {
      if (timers[i]) {
        stopTimer(i);
        detenidos++;
      }
    }
    
    if (detenidos > 0) {
      showToast(`${detenidos} timers detenidos`, 'success');
    } else {
      showToast('No hay timers activos', 'warning');
    }
    
  } catch (error) {
    console.error('Error stopping all timers:', error);
  }
}

// ===============================================
// FUNCIONES DE UTILIDAD
// ===============================================

function resetTimerState(i) {
  extended[i] = false;
  negatives[i] = false;
  startTimes[i] = null;
  totalDurations[i] = CONFIG.DURACION_INICIAL;
  resetAlertStates(i);
}

function resetAlertStates(i) {
  alertaPreviaPlayed[i] = false;
  alertaNegativa1Played[i] = false;
  alertaNegativa2Played[i] = false;
}

function updateTimerDisplay(i, value) {
  try {
    const timerElement = document.getElementById(`timer-${i}`);
    if (!timerElement) return;
    
    const absTime = Math.abs(value);
    const minutes = String(Math.floor(absTime / 60)).padStart(2, '0');
    const seconds = String(absTime % 60).padStart(2, '0');
    const prefix = value < 0 ? "-" : "";
    
    timerElement.textContent = `${prefix}${minutes}:${seconds}`;
    
    // Añadir clase de negativo si es necesario
    if (value < 0) {
      timerElement.classList.add("negative-timer");
    } else {
      timerElement.classList.remove("negative-timer");
    }
  } catch (error) {
    console.error(`Error updating display for timer ${i}:`, error);
  }
}

function updateCardUI(i, isActive) {
  try {
    const card = document.querySelector(`.card[data-id="${i}"]`);
    if (!card) return;
    
    const overlay = card.querySelector(".overlay");
    if (!overlay) return;
    
    // Actualizar estado de la tarjeta
    if (isActive) {
      card.classList.add("active-timer");
      card.setAttribute("data-activo", "true");
    } else {
      card.classList.remove("active-timer");
      card.setAttribute("data-activo", "false");
    }
    
    // Gestionar botones
    let btnsContainer = overlay.querySelector(".timer-btns");
    
    if (isActive && !btnsContainer) {
      // Crear botones para timer activo
      btnsContainer = document.createElement("div");
      btnsContainer.className = "timer-btns flex gap-2 mt-2";
      
      const btnRestart = document.createElement("button");
      btnRestart.textContent = "Reiniciar";
      btnRestart.className = "btn-restart bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-1 px-3 rounded transition";
      btnRestart.onclick = () => restartTimer(i);
      
      const btnStop = document.createElement("button");
      btnStop.textContent = "Detener";
      btnStop.className = "btn-stop bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded transition";
      btnStop.onclick = () => stopTimer(i);
      
      btnsContainer.appendChild(btnRestart);
      btnsContainer.appendChild(btnStop);
      overlay.appendChild(btnsContainer);
      
    } else if (!isActive && btnsContainer) {
      // Remover botones si el timer no está activo
      btnsContainer.remove();
    }
    
  } catch (error) {
    console.error(`Error updating card UI for ${i}:`, error);
  }
}

function saveTimerState(i, duration, running = true) {
  try {
    const state = {
      duration: duration,
      extended: extended[i],
      negative: negatives[i],
      running: running && !!timers[i],
      startTime: startTimes[i],
      totalDuration: totalDurations[i]
    };
    
    localStorage.setItem(`timer-${i}`, JSON.stringify(state));
  } catch (error) {
    console.error(`Error saving timer state ${i}:`, error);
  }
}

function loadTimerState(i) {
  try {
    const saved = localStorage.getItem(`timer-${i}`);
    if (!saved) return null;
    
    return JSON.parse(saved);
  } catch (error) {
    console.error(`Error loading timer state ${i}:`, error);
    return null;
  }
}

function getNombreCasa(i) {
  const nombres = [
    'Colinas', 'Low', 'Willow', 'C1', 'C2', 'C3', 
    'C4', 'Norte 1', 'Norte 2', 'Sprunk', 'El Quebrados', 'Cruce'
  ];
  return nombres[i] || `Casa ${i}`;
}

// ===============================================
// SISTEMA DE FILTROS
// ===============================================

function aplicarFiltros() {
  try {
    const ciudadSeleccionada = document.getElementById("ciudad-filter").value;
    const toggleActivos = document.getElementById("toggle-activos");
    const cards = document.querySelectorAll(".card");
    
    let visibles = 0;
    
    cards.forEach(card => {
      const ciudad = card.getAttribute("data-ciudad");
      const esActivo = card.getAttribute("data-activo") === "true";
      
      let mostrar = true;
      
      // Filtro por ciudad
      if (ciudadSeleccionada !== "Todas" && ciudad !== ciudadSeleccionada) {
        mostrar = false;
      }
      
      // Filtro por activos
      if (toggleActivos.checked && !esActivo) {
        mostrar = false;
      }
      
      card.style.display = mostrar ? "block" : "none";
      if (mostrar) visibles++;
    });
    
    // Actualizar contador de cards visibles
    console.log(`${visibles} cards visibles después del filtro`);
    
  } catch (error) {
    console.error('Error applying filters:', error);
  }
}

function actualizarContadorActivos() {
  try {
    const contador = document.getElementById("contador-activos");
    if (!contador) return;
    
    // Contar timers realmente activos (no los pausados en límite)
    const activos = timers.filter(timer => timer !== null).length;
    contador.textContent = activos;
    
    // Añadir efecto visual
    contador.style.transform = 'scale(1.2)';
    setTimeout(() => {
      contador.style.transform = 'scale(1)';
    }, 200);
    
  } catch (error) {
    console.error('Error updating active counter:', error);
  }
}

// ===============================================
// EXPORTAR / IMPORTAR
// ===============================================

function exportarTimers() {
  try {
    const data = {};
    
    for (let i = 0; i < CONFIG.TOTAL_CASAS; i++) {
      const state = loadTimerState(i);
      if (state) {
        // Actualizar duración si el timer está corriendo
        if (state.running && state.startTime && typeof state.totalDuration === "number") {
          const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
          if (!state.extended && !state.negative) {
            state.duration = Math.max(state.totalDuration - elapsed, 0);
          } else {
            state.duration = -1 * (elapsed - state.totalDuration);
          }
        }
        data[`timer-${i}`] = state;
      }
    }
    
    return JSON.stringify(data, null, 2);
  } catch (error) {
    console.error('Error exporting timers:', error);
    return '{}';
  }
}

function exportarTimersUI() {
  try {
    const json = exportarTimers();
    mostrarModalJson("Copia este JSON para compartir tus timers:", json);
    showToast('Timers exportados al portapapeles', 'success');
  } catch (error) {
    console.error('Error in export UI:', error);
    showToast('Error al exportar timers', 'error');
  }
}

function mostrarImportarTimers() {
  try {
    mostrarModalJsonImportar();
  } catch (error) {
    console.error('Error showing import modal:', error);
    showToast('Error al mostrar importador', 'error');
  }
}

function mostrarModalJson(labelText, json) {
  try {
    const modal = createModal();
    const content = createModalContent();
    
    const label = document.createElement('div');
    label.textContent = labelText;
    label.style.color = '#fff';
    label.style.marginBottom = '8px';
    
    const textarea = document.createElement('textarea');
    textarea.value = json;
    textarea.readOnly = true;
    textarea.className = 'modal-textarea';
    
    const btnCerrar = document.createElement('button');
    btnCerrar.textContent = 'Cerrar';
    btnCerrar.className = 'bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded shadow transition w-full';
    btnCerrar.onclick = () => {
      document.body.removeChild(modal);
    };
    
    content.appendChild(label);
    content.appendChild(textarea);
    content.appendChild(btnCerrar);
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Auto-seleccionar el texto
    textarea.select();
    
    // Intentar copiar al portapapeles
    if (navigator.clipboard) {
      navigator.clipboard.writeText(json).catch(() => {
        // Fallback para navegadores sin clipboard API
        try {
          document.execCommand('copy');
        } catch (e) {
          console.warn('Copy to clipboard failed');
        }
      });
    } else {
      try {
        document.execCommand('copy');
      } catch (e) {
        console.warn('Copy to clipboard failed');
      }
    }
    
  } catch (error) {
    console.error('Error showing JSON modal:', error);
  }
}

function mostrarModalJsonImportar() {
  try {
    const modal = createModal();
    const content = createModalContent();
    
    const label = document.createElement('div');
    label.textContent = "Pega aquí el JSON de los timers:";
    label.style.color = '#fff';
    label.style.marginBottom = '8px';
    
    const textarea = document.createElement('textarea');
    textarea.placeholder = "Pega aquí el JSON de los timers";
    textarea.className = 'modal-textarea';
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    
    const btnImportar = document.createElement('button');
    btnImportar.textContent = 'Importar';
    btnImportar.className = 'bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded shadow transition w-full mb-2';
    btnImportar.onclick = () => importarTimersHandler(textarea, errorDiv, modal);
    
    const btnCerrar = document.createElement('button');
    btnCerrar.textContent = 'Cancelar';
    btnCerrar.className = 'bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded shadow transition w-full';
    btnCerrar.onclick = () => document.body.removeChild(modal);
    
    content.appendChild(label);
    content.appendChild(textarea);
    content.appendChild(errorDiv);
    content.appendChild(btnImportar);
    content.appendChild(btnCerrar);
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Focus en el textarea
    setTimeout(() => textarea.focus(), 100);
    
  } catch (error) {
    console.error('Error showing import modal:', error);
  }
}

function importarTimersHandler(textarea, errorDiv, modal) {
  try {
    const json = textarea.value.trim();
    
    if (!json) {
      errorDiv.textContent = 'Por favor ingresa un JSON válido.';
      return;
    }
    
    let data;
    try {
      data = JSON.parse(json);
    } catch (e) {
      errorDiv.textContent = `JSON inválido: ${e.message}`;
      return;
    }
    
    // Importar datos
    let importados = 0;
    for (let i = 0; i < CONFIG.TOTAL_CASAS; i++) {
      const key = `timer-${i}`;
      if (data[key]) {
        localStorage.setItem(key, JSON.stringify(data[key]));
        importados++;
      }
    }
    
    document.body.removeChild(modal);
    showToast(`${importados} timers importados correctamente`, 'success');
    
    // Recargar la página para aplicar cambios
    setTimeout(() => location.reload(), 1000);
    
  } catch (error) {
    console.error('Error importing timers:', error);
    errorDiv.textContent = 'Error al procesar los datos.';
  }
}

function createModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  
  // Cerrar con Escape
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      document.body.removeChild(modal);
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
  
  return modal;
}

function createModalContent() {
  const content = document.createElement('div');
  content.className = 'modal-content';
  return content;
}

// ===============================================
// SISTEMA DE NOTIFICACIONES TOAST
// ===============================================

function showToast(message, type = 'info', duration = 3000) {
  try {
    // Remover toasts existentes
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Mostrar con animación
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Ocultar después del tiempo especificado
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 300);
    }, duration);
    
  } catch (error) {
    console.error('Error showing toast:', error);
  }
}

// ===============================================
// INICIALIZACIÓN Y EVENTOS
// ===============================================

function initializeApp() {
  try {
    console.log('Inicializando aplicación de temporizadores...');
    
    // Cargar estados guardados
    loadSavedTimers();
    
    // Configurar eventos
    setupEventListeners();
    
    // Actualizar UI inicial
    aplicarFiltros();
    actualizarContadorActivos();
    
    console.log('Aplicación inicializada correctamente');
    showToast('Aplicación cargada correctamente', 'success', 2000);
    
  } catch (error) {
    console.error('Error initializing app:', error);
    showToast('Error al inicializar la aplicación', 'error');
  }
}

function loadSavedTimers() {
  for (let i = 0; i < CONFIG.TOTAL_CASAS; i++) {
    try {
      const saved = loadTimerState(i);
      if (saved) {
        extended[i] = saved.extended || false;
        negatives[i] = saved.negative || false;
        startTimes[i] = saved.startTime || null;
        totalDurations[i] = saved.totalDuration || CONFIG.DURACION_INICIAL;
        
        if (saved.running && startTimes[i]) {
          startTimer(i, true);
        } else {
          updateTimerDisplay(i, saved.duration ?? CONFIG.DURACION_INICIAL);
        }
      } else {
        updateTimerDisplay(i, CONFIG.DURACION_INICIAL);
      }
    } catch (error) {
      console.error(`Error loading timer ${i}:`, error);
      updateTimerDisplay(i, CONFIG.DURACION_INICIAL);
    }
  }
}

function setupEventListeners() {
  try {
    // Listener para cambios en filtros
    const ciudadFilter = document.getElementById("ciudad-filter");
    const toggleActivos = document.getElementById("toggle-activos");
    
    if (ciudadFilter) {
      ciudadFilter.addEventListener('change', aplicarFiltros);
    }
    
    if (toggleActivos) {
      toggleActivos.addEventListener('change', aplicarFiltros);
    }
    
    // Listener para visibility change (pausar/reanudar cuando se cambia de pestaña)
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Listener para beforeunload (guardar estado antes de cerrar)
    window.addEventListener('beforeunload', saveAllTimerStates);
    
    // Listener para errores de audio
    setupAudioErrorHandling();
    
  } catch (error) {
    console.error('Error setting up event listeners:', error);
  }
}

function handleVisibilityChange() {
  if (document.hidden) {
    // La página se está ocultando, pausar sonidos
    audioManager.stopAllSounds();
  } else {
    // La página se está mostrando de nuevo, verificar timers
    for (let i = 0; i < CONFIG.TOTAL_CASAS; i++) {
      if (timers[i]) {
        // Re-sincronizar timer si es necesario
        updateTimer(i);
      }
    }
    actualizarContadorActivos();
  }
}

function saveAllTimerStates() {
  for (let i = 0; i < CONFIG.TOTAL_CASAS; i++) {
    if (timers[i]) {
      try {
        const elapsed = Math.floor((Date.now() - startTimes[i]) / 1000);
        let currentDuration;
        
        if (!extended[i] && !negatives[i]) {
          currentDuration = Math.max(totalDurations[i] - elapsed, 0);
        } else {
          currentDuration = -1 * (elapsed - totalDurations[i]);
        }
        
        saveTimerState(i, currentDuration, true);
      } catch (error) {
        console.error(`Error saving timer ${i} on unload:`, error);
      }
    }
  }
}

function setupAudioErrorHandling() {
  const audioElements = [
    audioManager.alarmSound,
    audioManager.alarmaUnicaSound,
    audioManager.alertStartSound,
    audioManager.alertEndSound
  ];
  
  audioElements.forEach((audio, index) => {
    if (audio) {
      audio.addEventListener('error', (e) => {
        console.warn(`Audio element ${index} error:`, e);
      });
      
      audio.addEventListener('canplay', () => {
        console.log(`Audio element ${index} ready`);
      });
    }
  });
}

// ===============================================
// FUNCIONES DE MANEJO DE ERRORES
// ===============================================

function handleError(error, context = '') {
  console.error(`Error in ${context}:`, error);
  showToast(`Error: ${context}`, 'error');
}

// Capturar errores no manejados
window.addEventListener('error', (event) => {
  console.error('Unhandled error:', event.error);
  showToast('Se produjo un error inesperado', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  event.preventDefault();
});

// ===============================================
// UTILIDADES ADICIONALES
// ===============================================

function formatTime(seconds) {
  const absSeconds = Math.abs(seconds);
  const mins = Math.floor(absSeconds / 60);
  const secs = absSeconds % 60;
  const sign = seconds < 0 ? '-' : '';
  return `${sign}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Versión optimizada de aplicar filtros con debounce
const aplicarFiltrosDebounced = debounce(aplicarFiltros, 300);

// ===============================================
// API PÚBLICA PARA TESTING
// ===============================================

window.TimersApp = {
  startTimer,
  stopTimer,
  restartTimer,
  detenerTodosTimers,
  exportarTimers,
  importarTimersHandler,
  aplicarFiltros,
  CONFIG,
  timers,
  audioManager
};

// ===============================================
// INICIALIZACIÓN AUTOMÁTICA
// ===============================================

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Inicializar también cuando la ventana se carga completamente
window.addEventListener('load', () => {
  console.log('Window fully loaded, running final checks...');
  
  // Verificar que todos los elementos necesarios estén presentes
  const requiredElements = [
    'ciudad-filter',
    'toggle-activos', 
    'contador-activos',
    'cards'
  ];
  
  const missingElements = requiredElements.filter(id => !document.getElementById(id));
  
  if (missingElements.length > 0) {
    console.warn('Missing required elements:', missingElements);
    showToast('Algunos elementos de la interfaz no están disponibles', 'warning');
  }
  
  // Aplicar filtros una vez más para asegurar consistencia
  setTimeout(aplicarFiltros, 500);
});

console.log('Script de temporizadores cargado correctamente');
