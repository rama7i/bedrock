// public/app.js - updated to show both filtered and unfiltered results
document.addEventListener('DOMContentLoaded', () => {
  const queryForm = document.getElementById('queryForm');
  const knowledgeBaseIdInput = document.getElementById('knowledgeBaseId');
  const queryInput = document.getElementById('query');
  const modelIdSelect = document.getElementById('modelId');
  const filtersContainer = document.getElementById('filtersContainer');
  const clearFiltersBtn = document.getElementById('clearFilters');
  const submitBtn = document.getElementById('submitBtn');
  const errorDiv = document.getElementById('error');
  const resultsDiv = document.getElementById('results');
  const resultCardsDiv = document.getElementById('resultCards');
  const llmResponseDiv = document.getElementById('llmResponse');
  const loadingDiv = document.getElementById('loading');
  const appliedFiltersDiv = document.getElementById('appliedFilters');
  const filterStatsDiv = document.getElementById('filterStats');
  const unfilteredResultsDiv = document.getElementById('unfilteredResults');
  const discardReasonsDiv = document.getElementById('discardReasons');
  const buttonSpinner = document.querySelector('.button-spinner');
  const buttonText = document.querySelector('.button-text');

  // Select elements for filters
  const subjectFilter = document.getElementById('subjectFilter');
  const gradeFilter = document.getElementById('gradeFilter');
  const unitFilter = document.getElementById('unitFilter');

  // Initialize Select2 for all filter selects
  function initializeSelect2() {
    $('.filter-select').select2({
      dir: 'rtl',
      placeholder: 'اختر...',
      allowClear: true,
      width: '100%',
      language: {
        noResults: function() {
          return "لا توجد نتائج";
        }
      }
    });
  }

  // Function to populate a select element with options
  function populateSelect(selectElement, optionsArray) {
    if (!selectElement) {
      console.error('Select element not found');
      return;
    }

    // Clear existing options
    selectElement.innerHTML = '';

    // Add a default empty option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'اختر...';
    selectElement.appendChild(defaultOption);

    // Add the actual options
    optionsArray.forEach(option => {
      const optionElement = document.createElement('option');
      optionElement.value = option;
      optionElement.textContent = option;
      selectElement.appendChild(optionElement);
    });

    // Refresh Select2
    $(selectElement).trigger('change');
  }

  // Fetch metadata options from server when page loads
  async function fetchMetadataOptions() {
    try {
      showLoading(true, 'جاري تحميل خيارات البيانات الوصفية...');
      
      // Add a small delay to ensure loading state is visible
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const response = await fetch('/api/metadata-options');
      if (!response.ok) {
        throw new Error('فشل في استرداد خيارات البيانات الوصفية');
      }

      const options = await response.json();
      console.log('Received metadata options:', options);

      // Populate Subject dropdown
      if (options.Subject && options.Subject.length > 0) {
        populateSelect(subjectFilter, options.Subject);
      } else {
        console.warn('No Subject options available');
      }

      // Populate Grade dropdown
      if (options.Grade && options.Grade.length > 0) {
        populateSelect(gradeFilter, options.Grade);
      } else {
        console.warn('No Grade options available');
      }

      // Populate Unit dropdown
      if (options.Unit && options.Unit.length > 0) {
        populateSelect(unitFilter, options.Unit.map(String));
      } else {
        console.warn('No Unit options available');
      }

      // Initialize Select2 after all options are populated
      initializeSelect2();
      
      // Ensure loading is hidden
      showLoading(false);
    } catch (error) {
      console.error('Error fetching metadata options:', error);
      showError(error.message);
      showLoading(false);
    }
  }

  // Start fetching metadata options
  fetchMetadataOptions();

  // Clear filters button handler
  clearFiltersBtn.addEventListener('click', () => {
    $('.filter-select').val(null).trigger('change');
  });

  // Submit form handler
  queryForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const knowledgeBaseId = knowledgeBaseIdInput.value.trim();
    const query = queryInput.value.trim();
    const modelId = modelIdSelect.value;

    // Validate inputs
    if (!knowledgeBaseId || !query) {
      showError('معرّف قاعدة المعرفة والاستعلام مطلوبان');
      return;
    }

    // Collect metadata filters from all select elements
    const metadataFilters = [];

    // Process all filter selects
    document.querySelectorAll('.filter-select').forEach(select => {
      const key = select.getAttribute('data-key');
      const selectedValues = Array.from(select.selectedOptions).map(option => option.value);

      // Add each selected value as a separate filter with the same key
      selectedValues.forEach(value => {
        if (value) {
          metadataFilters.push({ key, value });
        }
      });
    });

    // Show loading
    showLoading(true, 'جاري معالجة الاستعلام...');
    hideError();
    hideResults();

    try {
      // Send the query to the server
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          knowledgeBaseId,
          query,
          metadataFilters,
          modelId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'فشل في الاستعلام عن قاعدة المعرفة');
      }

      const result = await response.json();

      // Display results
      displayResults(result);

      // Display applied filters summary
      if (result.appliedFilters) {
        displayAppliedFilters(result.appliedFilters);
      }

      // Display filtering statistics if available
      if (result.originalResultCount !== undefined && result.filteredResultCount !== undefined) {
        displayFilterStats(result.originalResultCount, result.filteredResultCount);
      }

      // Display unfiltered results if available (when no results passed filtering)
      if (result.unfiltered && result.unfiltered.length > 0) {
        displayUnfilteredResults(result.unfiltered);
      } else {
        hideUnfilteredResults();
      }

      // Display reasons for discarding results if available
      if (result.discardReasons && result.discardReasons.length > 0) {
        displayDiscardReasons(result.discardReasons);
      } else {
        hideDiscardReasons();
      }
    } catch (error) {
      showError(error.message);
    } finally {
      showLoading(false);
    }
  });

  // Display reasons why results were discarded
  function displayDiscardReasons(reasons) {
    if (!discardReasonsDiv) return;

    discardReasonsDiv.innerHTML = '';
    discardReasonsDiv.classList.remove('hidden');

    const reasonsTitle = document.createElement('h3');
    reasonsTitle.textContent = 'أسباب رفض النتائج:';
    discardReasonsDiv.appendChild(reasonsTitle);

    const reasonsList = document.createElement('div');
    reasonsList.className = 'discard-reasons-list';

    reasons.forEach((item, index) => {
      const reasonItem = document.createElement('div');
      reasonItem.className = 'discard-reason-item';

      // Format metadata
      let metadataStr = '';
      if (item.metadata) {
        for (const [key, value] of Object.entries(item.metadata)) {
          let arabicKey = key;
          if (key === 'Subject') arabicKey = 'المادة';
          if (key === 'Grade') arabicKey = 'الصف';
          if (key === 'Unit') arabicKey = 'الوحدة';

          metadataStr += `${arabicKey}: ${value}, `;
        }
        metadataStr = metadataStr.replace(/, $/, '');
      }

      reasonItem.innerHTML = `
        <div class="reason-header">النتيجة ${index + 1}</div>
        <div class="reason-metadata">${metadataStr || 'لا توجد بيانات وصفية'}</div>
        <div class="reason-text"><strong>سبب الرفض:</strong> ${item.reason}</div>
      `;

      reasonsList.appendChild(reasonItem);
    });

    discardReasonsDiv.appendChild(reasonsList);
  }

  // Hide discard reasons
  function hideDiscardReasons() {
    if (discardReasonsDiv) {
      discardReasonsDiv.classList.add('hidden');
    }
  }

  // Display unfiltered results
  function displayUnfilteredResults(results) {
    if (!unfilteredResultsDiv) return;

    unfilteredResultsDiv.innerHTML = '';
    unfilteredResultsDiv.classList.remove('hidden');

    const unfilteredTitle = document.createElement('h3');
    unfilteredTitle.textContent = 'النتائج الأصلية قبل التصفية:';
    unfilteredResultsDiv.appendChild(unfilteredTitle);

    const noteElement = document.createElement('p');
    noteElement.className = 'unfiltered-note';
    noteElement.textContent = 'هذه النتائج معروضة للتشخيص فقط ولم تستخدم في الرد النهائي.';
    unfilteredResultsDiv.appendChild(noteElement);

    const resultsList = document.createElement('div');
    resultsList.className = 'unfiltered-results-list';

    results.forEach((result, index) => {
      const card = document.createElement('div');
      card.className = 'result-card unfiltered-result';

      // Get metadata for display
      let metadataStr = '';
      if (result.metadata && result.metadata.metadataAttributes) {
        const attrs = result.metadata.metadataAttributes;

        if (attrs.Subject) metadataStr += `المادة: ${attrs.Subject} | `;
        if (attrs.Grade) metadataStr += `الصف: ${attrs.Grade} | `;
        if (attrs.Unit) metadataStr += `الوحدة: ${attrs.Unit}`;

        // Remove trailing separator if present
        metadataStr = metadataStr.replace(/\|\s*$/, '');
      }

      // Create card content
      card.innerHTML = `
        <h4>النتيجة الأصلية ${index + 1}</h4>
        ${metadataStr ? `<p class="metadata-summary unfiltered-metadata">${metadataStr}</p>` : ''}
        <p><strong>المحتوى:</strong> ${result.content.text}</p>
        <p><strong>الدرجة:</strong> ${result.score || 'غير متوفر'}</p>
      `;

      resultsList.appendChild(card);
    });

    unfilteredResultsDiv.appendChild(resultsList);
  }

  // Hide unfiltered results
  function hideUnfilteredResults() {
    if (unfilteredResultsDiv) {
      unfilteredResultsDiv.classList.add('hidden');
    }
  }

  // Display filtering statistics
  function displayFilterStats(originalCount, filteredCount) {
    if (!filterStatsDiv) return;

    filterStatsDiv.innerHTML = '';
    filterStatsDiv.classList.remove('hidden');

    const statsHtml = `
      <p>عدد النتائج الأصلية قبل التصفية: <strong>${originalCount}</strong></p>
      <p>عدد النتائج بعد تطبيق الفلاتر: <strong>${filteredCount}</strong></p>
    `;

    filterStatsDiv.innerHTML = statsHtml;

    // Add warning if all results were filtered out
    if (originalCount > 0 && filteredCount === 0) {
      const warningEl = document.createElement('div');
      warningEl.className = 'filter-warning';
      warningEl.innerHTML = `
        <p>⚠️ <strong>تنبيه:</strong> تم رفض جميع النتائج بسبب الفلاتر المطبقة. يمكنك النظر في النتائج الأصلية أدناه للتحقق من سبب الرفض.</p>
      `;
      filterStatsDiv.appendChild(warningEl);
    }
  }

  // Display the applied filters summary
  function displayAppliedFilters(filters) {
    if (!appliedFiltersDiv) return;

    appliedFiltersDiv.innerHTML = '';

    const filterKeys = Object.keys(filters);
    if (filterKeys.length === 0) {
      appliedFiltersDiv.classList.add('hidden');
      return;
    }

    const filterTitle = document.createElement('h3');
    filterTitle.textContent = 'الفلاتر المطبقة:';
    appliedFiltersDiv.appendChild(filterTitle);

    const filterList = document.createElement('div');
    filterList.className = 'filter-summary';

    filterKeys.forEach(key => {
      const values = filters[key];
      const filterItem = document.createElement('div');
      filterItem.className = 'filter-summary-item';

      // Translate the key to Arabic
      let arabicKey = key;
      if (key === 'Subject') arabicKey = 'المادة';
      if (key === 'Grade') arabicKey = 'الصف';
      if (key === 'Unit') arabicKey = 'الوحدة';

      filterItem.innerHTML = `<strong>${arabicKey}:</strong> ${values.join(' أو ')}`;
      filterList.appendChild(filterItem);
    });

    appliedFiltersDiv.appendChild(filterList);
    appliedFiltersDiv.classList.remove('hidden');
  }

  // Display the results
  function displayResults(data) {
    // Display LLM response
    llmResponseDiv.textContent = data.llmResponse || "لم يتم استلام استجابة من النموذج اللغوي.";

    // Display KB results
    resultCardsDiv.innerHTML = '';

    const kbResults = data.kbResults;

    if (!kbResults.retrievalResults || kbResults.retrievalResults.length === 0) {
      resultCardsDiv.innerHTML = '<p>لم يتم العثور على نتائج في قاعدة المعرفة تطابق الفلاتر المحددة.</p>';
      resultsDiv.classList.remove('hidden');
      return;
    }

    kbResults.retrievalResults.forEach((result, index) => {
      const card = document.createElement('div');
      card.className = 'result-card';

      // Get metadata for display
      let metadataStr = '';
      if (result.metadata && result.metadata.metadataAttributes) {
        const attrs = result.metadata.metadataAttributes;

        if (attrs.Subject) metadataStr += `المادة: ${attrs.Subject} | `;
        if (attrs.Grade) metadataStr += `الصف: ${attrs.Grade} | `;
        if (attrs.Unit) metadataStr += `الوحدة: ${attrs.Unit}`;

        // Remove trailing separator if present
        metadataStr = metadataStr.replace(/\|\s*$/, '');
      }

      // Create card content
      card.innerHTML = `
        <h3>النتيجة ${index + 1}</h3>
        ${metadataStr ? `<p class="metadata-summary">${metadataStr}</p>` : ''}
        <p><strong>المحتوى:</strong> ${result.content.text}</p>
        <div class="metadata-section">
          <button class="metadata-toggle">عرض البيانات الوصفية الكاملة</button>
          <div class="metadata-content hidden">${JSON.stringify(result.metadata, null, 2)}</div>
        </div>
        <p><strong>الدرجة:</strong> ${result.score || 'غير متوفر'}</p>
      `;

      resultCardsDiv.appendChild(card);

      // Add toggle functionality for metadata
      const toggleBtn = card.querySelector('.metadata-toggle');
      const metadataContent = card.querySelector('.metadata-content');

      toggleBtn.addEventListener('click', () => {
        const isHidden = metadataContent.classList.contains('hidden');
        metadataContent.classList.toggle('hidden');
        toggleBtn.textContent = isHidden ? 'إخفاء البيانات الوصفية الكاملة' : 'عرض البيانات الوصفية الكاملة';
      });
    });

    resultsDiv.classList.remove('hidden');
  }

  // Function to show/hide loading state
  function showLoading(show, message = 'جاري التحميل...') {
    const loadingText = loadingDiv.querySelector('p');
    if (!loadingText) {
      console.error('Loading text element not found');
      return;
    }

    if (show) {
      loadingDiv.classList.remove('hidden');
      loadingText.textContent = message;
      submitBtn.disabled = true;
      if (buttonText) buttonText.classList.add('hidden');
      if (buttonSpinner) buttonSpinner.classList.remove('hidden');
    } else {
      loadingDiv.classList.add('hidden');
      loadingText.textContent = 'جاري التحميل...';
      submitBtn.disabled = false;
      if (buttonText) buttonText.classList.remove('hidden');
      if (buttonSpinner) buttonSpinner.classList.add('hidden');
    }
  }

  // Function to show error message
  function showError(message) {
    errorDiv.classList.remove('hidden');
    errorDiv.querySelector('.error-text').textContent = message;
  }

  // Function to hide error message
  function hideError() {
    errorDiv.classList.add('hidden');
  }

  // Function to hide results
  function hideResults() {
    resultsDiv.classList.add('hidden');
    appliedFiltersDiv.classList.add('hidden');
    filterStatsDiv.classList.add('hidden');
    unfilteredResultsDiv.classList.add('hidden');
    discardReasonsDiv.classList.add('hidden');
  }
});