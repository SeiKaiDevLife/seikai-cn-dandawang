import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace custom grid logic
old_logic = '''        const toggleSlotSelection = (slot) => {
            if (customGridState.value === 'edit-layout') {
                slot.selected = !slot.selected;
            } else if (customGridState.value === 'fill-images') {
                currentUploadSlotId.value = slot.id;
                fileInputRef.value.click();
            }
        };

        const mergeSlots = () => {
            const selected = customGridSlots.value.filter(s => s.selected);
            if (selected.length < 2) return;
            const minR = Math.min(...selected.map(s => s.r));
            const maxR = Math.max(...selected.map(s => s.r + s.rowSpan - 1));
            const minC = Math.min(...selected.map(s => s.c));
            const maxC = Math.max(...selected.map(s => s.c + s.colSpan - 1));
            
            const expectedArea = (maxR - minR + 1) * (maxC - minC + 1);
            const actualArea = selected.reduce((sum, s) => sum + (s.rowSpan * s.colSpan), 0);
            
            if (expectedArea !== actualArea) {
                alert('请选择一个完整的矩形区域进行合并！');
                return;
            }
            
            customGridSlots.value = customGridSlots.value.filter(s => !s.selected);
            customGridSlots.value.push({
                id: c_merged_,
                r: minR, c: minC,
                rowSpan: maxR - minR + 1,
                colSpan: maxC - minC + 1,
                image: null,
                selected: false
            });
        };'''

new_logic = '''        const isDragging = ref(false);
        const dragStartSlot = ref(null);
        const dragCurrentSlot = ref(null);

        const onDragStart = (slot) => {
            if (customGridState.value !== 'edit-layout') {
                currentUploadSlotId.value = slot.id;
                if (fileInputRef.value) fileInputRef.value.click();
                return;
            }
            if (slot.rowSpan > 1 || slot.colSpan > 1) {
                unmergeSlot(slot);
                return;
            }
            isDragging.value = true;
            dragStartSlot.value = slot;
            dragCurrentSlot.value = slot;
        };

        const onMouseEnter = (slot) => {
            if (!isDragging.value) return;
            dragCurrentSlot.value = slot;
        };

        const onTouchMove = (e) => {
            if (!isDragging.value) return;
            const touch = e.touches[0];
            const elem = document.elementFromPoint(touch.clientX, touch.clientY);
            if (elem) {
                const slotElem = elem.closest('.custom-slot');
                if (slotElem) {
                    const slotId = slotElem.getAttribute('data-id');
                    const slot = customGridSlots.value.find(s => s.id === slotId);
                    if (slot) dragCurrentSlot.value = slot;
                }
            }
        };

        const onDragEnd = () => {
            if (!isDragging.value) return;
            isDragging.value = false;
            if (dragStartSlot.value && dragCurrentSlot.value && dragStartSlot.value !== dragCurrentSlot.value) {
                attemptMerge(dragStartSlot.value, dragCurrentSlot.value);
            }
            dragStartSlot.value = null;
            dragCurrentSlot.value = null;
        };

        const isSlotInDragPreview = (slot) => {
            if (!isDragging.value || !dragStartSlot.value || !dragCurrentSlot.value) return false;
            const minR = Math.min(dragStartSlot.value.r, dragCurrentSlot.value.r);
            const maxR = Math.max(dragStartSlot.value.r + dragStartSlot.value.rowSpan - 1, dragCurrentSlot.value.r + dragCurrentSlot.value.rowSpan - 1);
            const minC = Math.min(dragStartSlot.value.c, dragCurrentSlot.value.c);
            const maxC = Math.max(dragStartSlot.value.c + dragStartSlot.value.colSpan - 1, dragCurrentSlot.value.c + dragCurrentSlot.value.colSpan - 1);
            
            return slot.r >= minR && slot.r <= maxR && slot.c >= minC && slot.c <= maxC;
        };

        const attemptMerge = (slot1, slot2) => {
            const minR = Math.min(slot1.r, slot2.r);
            const maxR = Math.max(slot1.r + slot1.rowSpan - 1, slot2.r + slot2.rowSpan - 1);
            const minC = Math.min(slot1.c, slot2.c);
            const maxC = Math.max(slot1.c + slot1.colSpan - 1, slot2.c + slot2.colSpan - 1);
            
            const slotsInBox = customGridSlots.value.filter(s => {
                return s.r >= minR && s.r + s.rowSpan - 1 <= maxR &&
                       s.c >= minC && s.c + s.colSpan - 1 <= maxC;
            });
            
            const expectedArea = (maxR - minR + 1) * (maxC - minC + 1);
            const actualArea = slotsInBox.reduce((sum, s) => sum + (s.rowSpan * s.colSpan), 0);
            
            if (expectedArea !== actualArea) return;
            
            customGridSlots.value = customGridSlots.value.filter(s => !slotsInBox.includes(s));
            customGridSlots.value.push({
                id: c_merged_,
                r: minR, c: minC,
                rowSpan: maxR - minR + 1,
                colSpan: maxC - minC + 1,
                image: null,
                selected: false
            });
        };

        const unmergeSlot = (slot) => {
            customGridSlots.value = customGridSlots.value.filter(s => s.id !== slot.id);
            for (let r = slot.r; r < slot.r + slot.rowSpan; r++) {
                for (let c = slot.c; c < slot.c + slot.colSpan; c++) {
                    customGridSlots.value.push({
                        id: c_,
                        r, c, rowSpan: 1, colSpan: 1, image: null, selected: false
                    });
                }
            }
        };'''

content = content.replace(old_logic, new_logic)

# Replace exports
old_exports = '''            toggleSlotSelection,
            mergeSlots,
            resetCustomGrid,'''

new_exports = '''            onDragStart,
            onMouseEnter,
            onTouchMove,
            onDragEnd,
            isSlotInDragPreview,
            resetCustomGrid,'''

content = content.replace(old_exports, new_exports)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched app.js successfully.")
