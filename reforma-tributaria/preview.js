const items = document.getElementById('previewItems');
const addButton = document.getElementById('previewAddItem');

function addItem() {
  if (items.childElementCount >= 50) return;
  const row = document.createElement('div');
  row.className = 'draft-item';
  const fields = [
    ['Descrição', 'text', ''], ['Valor (R$)', 'number', '0.01'],
    ['NCM', 'text', ''], ['NBS', 'text', ''],
  ];
  for (const [title, type, step] of fields) {
    const wrapper = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = title;
    const input = document.createElement('input');
    input.type = type;
    if (step) input.step = step;
    label.append(input);
    wrapper.append(label);
    row.append(wrapper);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remover';
  remove.addEventListener('click', () => {
    if (items.childElementCount > 1) row.remove();
    addButton.disabled = items.childElementCount >= 50;
  });
  row.append(remove);
  items.append(row);
  addButton.disabled = items.childElementCount >= 50;
}

addButton.addEventListener('click', addItem);
document.getElementById('previewForm').addEventListener('submit', (event) => event.preventDefault());
document.getElementById('previewForm').addEventListener('reset', () => {
  items.replaceChildren();
  addItem();
});
addItem();
