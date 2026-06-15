import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace the custom grid UI section
old_custom_grid = '''                        <!-- 自定义九宫格编辑器 -->
                        <div class="custom-grid-section" v-if="publishMode === 'custom'">
                            <div class="custom-grid-controls" v-if="customGridState === 'edit-layout'">
                                <div class="controls-row">
                                    <label>高度格数 (行数): </label>
                                    <input type="number" v-model="customGridRows" @change="initCustomGrid" min="1" max="10">
                                </div>
                                <div class="controls-actions">
                                    <button class="merge-btn" @click="mergeSlots">合并选中</button>
                                    <button class="reset-btn" @click="resetCustomGrid">重置排版</button>
                                    <button class="confirm-layout-btn" @click="customGridState = 'fill-images'">确认布局</button>
                                </div>
                            </div>
                            <div class="custom-grid-controls" v-if="customGridState === 'fill-images'">
                                <p class="fill-hint">请点击下方所有空格上传图片</p>
                                <button class="reset-btn" @click="customGridState = 'edit-layout'">重新编辑</button>
                            </div>

                            <div class="custom-grid-editor" :style="{ gridTemplateRows: \epeat(\, 1fr)\ }">
                                <div class="custom-slot" 
                                    v-for="slot in customGridSlots" 
                                    :key="slot.id"
                                    :class="{ selected: slot.selected, 'has-image': slot.image }"
                                    :style="{ gridRow: \span \\, gridColumn: \span \\ }"
                                    @click="toggleSlotSelection(slot)">
                                    <div class="slot-placeholder" v-if="!slot.image">
                                        <span v-if="customGridState === 'edit-layout'">{{ slot.selected ? '已选' : '选择' }}</span>
                                        <span v-else>+ 照片</span>
                                    </div>
                                    <img :src="slot.image" v-if="slot.image">
                                </div>
                            </div>
                            <input type="file" accept="image/*" ref="fileInputRef" style="display:none;" @change="handleImageSelect">
                        </div>'''

new_custom_grid = '''                        <!-- 自定义九宫格编辑器 -->
                        <div class="custom-grid-section" v-if="publishMode === 'custom'">
                            <div class="custom-grid-controls" v-if="customGridState === 'edit-layout'">
                                <div class="controls-header">
                                    <span class="controls-title">高度配置 (行数)</span>
                                    <div class="stepper-control">
                                        <button class="stepper-btn" @click="customGridRows > 1 ? customGridRows-- : null; initCustomGrid()">-</button>
                                        <span class="stepper-value">{{ customGridRows }}</span>
                                        <button class="stepper-btn" @click="customGridRows < 10 ? customGridRows++ : null; initCustomGrid()">+</button>
                                    </div>
                                </div>
                                <p class="edit-hint">? 提示: 拖动框选合并格子，点击大格取消合并</p>
                                <div class="controls-actions">
                                    <button class="reset-btn" @click="resetCustomGrid">重置排版</button>
                                    <button class="confirm-layout-btn" @click="customGridState = 'fill-images'">下一步: 上传图片</button>
                                </div>
                            </div>
                            <div class="custom-grid-controls" v-if="customGridState === 'fill-images'">
                                <p class="fill-hint">请点击下方每一个空格上传对应的图片</p>
                                <button class="reset-btn" @click="customGridState = 'edit-layout'">返回重新编辑布局</button>
                            </div>

                            <div class="custom-grid-editor" 
                                @touchmove.prevent="onTouchMove"
                                @touchend="onDragEnd"
                                @mouseup="onDragEnd"
                                @mouseleave="onDragEnd"
                                :style="{ gridTemplateRows: \epeat(\, 1fr)\ }">
                                <div class="custom-slot" 
                                    v-for="slot in customGridSlots" 
                                    :key="slot.id"
                                    :data-id="slot.id"
                                    :class="{ 'is-drag-preview': isSlotInDragPreview(slot), 'has-image': slot.image }"
                                    :style="{ gridRow: \\ / span \\, gridColumn: \\ / span \\ }"
                                    @mousedown="onDragStart(slot)"
                                    @mouseenter="onMouseEnter(slot)"
                                    @touchstart.passive="onDragStart(slot)">
                                    <div class="slot-placeholder" v-if="!slot.image">
                                        <span v-if="customGridState === 'edit-layout'"></span>
                                        <span v-else>+ 照片</span>
                                    </div>
                                    <img :src="slot.image" v-if="slot.image">
                                </div>
                            </div>
                            <input type="file" accept="image/*" ref="fileInputRef" style="display:none;" @change="handleImageSelect">
                        </div>'''

content = content.replace(old_custom_grid, new_custom_grid)

# 2. Replace the FAB menu with circular SVG labels
old_fab = '''            <!-- 展开式发布菜单 (FAB Menu - 环形排列) -->
            <div class="fab-container" v-if="isLoggedIn && !selectedPost">
                <div class="fab-menu" :class="{ 'is-open': isFabOpen }">
                    <div class="fab-action action-1" @click="startPublish('custom')">
                        <span class="fab-label">自定义</span>
                        <button class="fab-mini-btn">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
                        </button>
                    </div>
                    <div class="fab-action action-2" @click="startPublish('nine-grid')">
                        <span class="fab-label">九宫格</span>
                        <button class="fab-mini-btn">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                        </button>
                    </div>
                    <div class="fab-action action-3" @click="startPublish('normal')">
                        <span class="fab-label">普通图文</span>
                        <button class="fab-mini-btn">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                        </button>
                    </div>
                </div>'''

new_fab = '''            <!-- 展开式发布菜单 (FAB Menu - 环形排列) -->
            <div class="fab-container" v-if="isLoggedIn && !selectedPost">
                <div class="fab-menu" :class="{ 'is-open': isFabOpen }">
                    <div class="fab-action action-1" @click="startPublish('custom')">
                        <div class="curved-label">
                            <svg viewBox="0 0 100 100" width="100" height="100">
                                <path id="curve-1" d="M 15 65 A 35 35 0 0 1 85 65" fill="transparent"/>
                                <text><textPath href="#curve-1" startOffset="50%" text-anchor="middle">自定义排版</textPath></text>
                            </svg>
                        </div>
                        <button class="fab-mini-btn">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
                        </button>
                    </div>
                    <div class="fab-action action-2" @click="startPublish('nine-grid')">
                        <div class="curved-label">
                            <svg viewBox="0 0 100 100" width="100" height="100">
                                <path id="curve-2" d="M 15 65 A 35 35 0 0 1 85 65" fill="transparent"/>
                                <text><textPath href="#curve-2" startOffset="50%" text-anchor="middle">九宫格</textPath></text>
                            </svg>
                        </div>
                        <button class="fab-mini-btn">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                        </button>
                    </div>
                    <div class="fab-action action-3" @click="startPublish('normal')">
                        <div class="curved-label">
                            <svg viewBox="0 0 100 100" width="100" height="100">
                                <path id="curve-3" d="M 15 65 A 35 35 0 0 1 85 65" fill="transparent"/>
                                <text><textPath href="#curve-3" startOffset="50%" text-anchor="middle">普通图文</textPath></text>
                            </svg>
                        </div>
                        <button class="fab-mini-btn">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                        </button>
                    </div>
                </div>'''

content = content.replace(old_fab, new_fab)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched index.html successfully.")
