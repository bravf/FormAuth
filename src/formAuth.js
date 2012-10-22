/*
 * @module FormAuth
 * @deps   jQuery, pureJS
 * @author 张东东 <bravfing@126.com>
 * @date   2012-9-25
 *
**/

PureJS.use(["jquery.net.js", "util.js", "formAuth.css"], function (){
    var pure = PureJS;
    var auth = window.FormAuth = {};
    
    /*****************************************/
    /*            辅助函数                   */
    /*****************************************/
    var comment = {ok : "&nbsp;", pending : "&nbsp;"};

    // 获取js对象类型
    var js_type = function (obj){
        return Object.prototype.toString.call(obj).slice(8,-1).toLowerCase();
    };

    var is_string = function (obj){
        return typeof obj == "string";
    };

    // 创建一个类
    var class_new = function (){
        return function (){
            this.init.apply(this, arguments);
        };
    };

    // 根据name得到一个jquery表单元素
    var element_name = function (name){
        var element = is_string(name) ? $("[name='" + name + "']") : name; 
        return element.length ? element : null;
    };

    // 根据id得到一个jquery表单元素
    var element_id = function (id){
        var element = is_string(id) ? $("#" + id) : id;
        return element.length ? element : null;
    };

    var str_length = function (str, is_real){
        return is_real ? str.replace(/[^\x00-\xff]/g, "--").length : str.length;
    };

    var error = auth.error = function (msg){
        throw "AuthError : " + msg;
    };
    
    /*****************************************/
    /*            表单                       */
    /*****************************************/
    auth.Form = class_new();
    auth.Form.prototype = {
        init : function (el_id){
            this.element = element_id(el_id);
            if (!this.element) error ("id='" + el_id + "'的元素不存在!");

            this.fields = [];
        },
        add : function (){
            var fields = [].slice.call(arguments);

            for (var i=0, field, len=fields.length; i<len; i++){
                field = fields[i];
                field.form = this;

                if (field_type(field) == "unknow") error(field + "不是一个表单元素对象!");            
                this.fields.push(field);
            }

            return this;
        },
        find : function (name){
            for (var i=0, field, len=this.fields.length; i<len; i++){
                field = this.fields[i];
                if (field.name == name) return field;
            }
            return null;
        },
        check : function (){
            var me = this;
            var ret = true;
            var io_rets = [];
            me.error_field = null;

            var children = me.element.find("input, radio, select, textarea, checkbox");

            var set_error_field = function (_field){
                // 如果是组合字段
                if (_field.error_field){
                    _field = _field.error_field;
                }

                if (_field.index == null){
                    _field.index = children.index(_field.element);
                }

                if (!me.error_field){
                    me.error_field = _field;
                }
                else {
                    if (_field.index <= me.error_field.index) me.error_field = _field;
                }
            };

            for (var i=0, len=me.fields.length, field, t_ret; i<len ;i++){
                field = me.fields[i];
                t_ret = field.check();

                if (typeof t_ret == "boolean"){
                    if (ret) {
                        ret = t_ret;
                    }
                    if (!t_ret) {
                        set_error_field(field);   
                    }              
                }
                else {
                    io_rets.push(t_ret);
                }
            }
                       
            // 处理IO验证失败
            var io_when = null;
            if (io_rets.length){
                io_when = $.when.apply(null, io_rets).fail(function (err_field){
                    set_error_field(err_field.setFocus());                    
                });
            }

            // 如果同步验证有没通过的, 直接返回fail defer
            if (!ret) {
                me.error_field.setFocus();                
                return $.Deferred().reject();
            }
            
            // 如果有IO验证
            if (io_when){
                return io_when;
            }

            // 如果同步验证通过且没有IO验证
            return $.Deferred().resolve();
        }
    };
    
    /*****************************************/
    /*            字段定义                   */
    /*****************************************/
    auth.Field = {};
    
    auth.Field.And = class_new();
    auth.Field.Or = class_new();
    var BaseField = auth.Field.BaseField = {};
    
    BaseField.Text = class_new();
    BaseField.Radio = class_new();
    BaseField.Select = class_new();
    BaseField.Checkbox = class_new();

    /*****************************************/
    /*            字段实现                   */
    /*****************************************/

    // 检查一个表单元素是否通过验证, 一般来说只有当field类型为text的时候才会返回defer(解决验证码、昵称检查等功能), 其他所有类型都返回bool。
    // 如此设计是为了兼顾常用功能, 同时降低复杂度。
    var comm_check = function (field){
        var value = field.value();
        var rules = field.rules;
        var io_rule;

        for (var i=0,len = rules.length, rule; i<len; i++){
            rule = rules[i];
            // 每个字段只能有一个IO验证(避免设计的过度复杂)
            if (rule_type(rule) == "IO"){
                io_rule = rule;
                continue;
            }
            if (!rule.check(field)){
                field.showMsg(rule.msg);
                return false;
            }
        }

        if (!io_rule){
            field.showMsg(comment.ok, "fa-ok");
            return true;
        }

        // 同步验证都通过则进行异步验证
        field.showMsg(comment.pending, "fa-io");
        return io_rule.check(field).done(function (){
            field.showMsg(comment.ok, "fa-ok");
        }).fail(function (){
            field.showMsg(io_rule.msg);
        });
    };

    var field_type = auth.Field.type = function (obj){
        var field = auth.Field;
        var baseField = field.BaseField;

        var table = {
            Or : field.Or,
            And : field.And,
            Text : baseField.Text,
            Radio : baseField.Radio,
            Select : baseField.Select,
            Checkbox : baseField.Checkbox
        };
        
        for (var _type in table){
            if (obj instanceof table[_type]) return _type;
        }

        return "unknow";
    };

    var text_proto = BaseField.Text.prototype = {
        init : function (el_name){
            this.name = el_name;
            this.element = element_name(el_name);
            if (!this.element) error ("name='" + el_name + "'的元素不存在!");

            this.rules = [];
            this.focus_msg = "";
            this._bind_events();
        },
        setFocusMsg : function (msg){
            this.focus_msg = msg + "";
            return this;
        },
        setFocus : function (){
            this.element.eq(0).focus();
            return this;
        },
        setDisabled : function (key){
            key = (key === true) ? true : false;
            this.disabled = key;

            return this;
        },
        on : function (){
            return this.setDisabled(false);
        },
        off : function (){
            return this.setDisabled(true);
        },
        add : function (){
            var rules = [].slice.call(arguments);
            
            for (var i=0 ,rule ,len=rules.length; i<len; i++){
                rule = rules[i];
                if (rule_type(rule) == "unknow") error(rule + "不是一个rule对象!");
                this.rules.push(rule);
            }

            return this;
        },
        value : function (){
            return this.element.val();
        },
        check : function (){
            // 如果禁用直接返回true
            if (this.disabled) {
                this.showMsg(comment.ok, "fa-ok");
                return true;
            }
            return comm_check(this);
        },
        showMsg : function (msg, style){
            if (!this.tip_ele) {
                var tip_id = this.name + "_tip";
                this.tip_ele = element_id(tip_id);
                if (!this.tip_ele){
                    this.tip_ele = $("<span/>").attr("id", tip_id).appendTo(this.element.parent());
                }
            }

            if (!style) style = "fa-error"; 
            this.tip_ele.html(msg).attr("class", "fa-tip " + style);

            return this;
        },
        _bind_events : function (){
            var me = this;
            
            var focus_E = function (){
                if (me.focus_msg) me.showMsg(me.focus_msg, "fa-normal");
            };
            var blur_E = function (){
                me.check();
            }

            me.element.bind("focus", focus_E).bind("blur", blur_E);

            me.unbind_events = function (){
                me.element.unbind("focus", focus_E).unbind("blur", blur_E);
            };
        }
    };
    
    // type = radio
    BaseField.Radio.prototype = {
        init : function (el_name){
            this.name = el_name;
            this.element = element_name(el_name);
            if (!this.element) error ("name='" + el_name + "'的元素不存在!");

            this.rules = [];
            this._bind_events();
        },
        add : text_proto.add,
        value : text_proto.value,
        setFocus : text_proto.setFocus,
        setDisabled : text_proto.setDisabled,
        on : text_proto.on,
        off : text_proto.off,
        check : text_proto.check,
        showMsg : text_proto.showMsg,
        _bind_events : function (){
            var me = this;
            
            var click_E = function (){
                me.check();
            };
            me.element.bind("click", click_E);

            me.unbind_events = function (){
                me.element.unbind("unbind", click_E);
            };
        }
    };
    
    // type = select
    BaseField.Select.prototype = {
        init : BaseField.Radio.prototype.init,
        add : text_proto.add,
        value : text_proto.value,
        setFocus : text_proto.setFocus,
        setDisabled : text_proto.setDisabled,
        on : text_proto.on,
        off : text_proto.off,
        check : text_proto.check,
        showMsg : text_proto.showMsg,
        _bind_events : function (){
            var me = this;

            var change_E = function (){
                me.check();
            };
            me.element.bind("change", change_E);

            me.unbind_events = function (){
                me.element.unbind("change", change_E);
            };
        }
    };
    
    // type = checkbox
    BaseField.Checkbox.prototype = BaseField.Radio.prototype;
    
    // type = orfield
    var field_or_proto = auth.Field.Or.prototype = {
        init : function (msg){
            this.fields = [];
            this.msg = msg;
            this.error_field = null;
        },
        add : function (){
            var fields = [].slice.call(arguments);

            for (var i=0, field, len=fields.length; i<len; i++){
                field = fields[i];
                if (field_type(field) == "unknow") error(field + "不是一个表单元素对象!");
                field.showMsg = Function.prototype; // field自己不再显示验证消息
                this._bind_events(field);
                this.fields.push(field);
            }

            return this;
        },
        setDisabled : text_proto.setDisabled,
        on : text_proto.on,
        off : text_proto.off,
        setFocus : function (){
            if (this.error_field) this.error_field.setFocus();
            this.fields[0].setFocus();

            return this;
        },
        check : function (){
            var me = this;

            // 如果禁用
            if (me.disabled) {
                me.showMsg(comment.ok, "fa-ok");
                return true;
            }
                
            for (var i=0, len=me.fields.length, field; i<len; i++){
                field = me.fields[i];
                if (field.check()){
                    me.showMsg(comment.ok, "fa-ok");
                    return true;
                }
            }

            me.error_field = me.fields[0];
            me.showMsg(me.msg); 
            return false;
        },
        setMsg : function (msg){
            this.msg = msg || "";
            return this;
        },
        showMsg : function (msg, style){
            if (!this.tip_ele) {
                var tip_id = this.fields[0].name + "_id";
                this.tip_ele = element_id(tip_id);
                if (!this.tip_ele){
                    this.tip_ele = $("<span/>").attr("id", tip_id).insertAfter(this.fields.slice(-1)[0].element);
                }
            }
            
            if (!style) style = "fa-error";
            this.tip_ele.html(msg).attr("class", "fa-tip " + style);

            return this;
        },
        _bind_events : function (field){
            var me = this;
            var type = field_type(field);
            var ele = field.element;           

            if (type == "Text"){
                field.unbind_events();
                ele.bind("blur", function (){
                    me.check();
                });
            }
            else if (type == "Radio" || type == "Checkbox"){
                field.unbind_events();
                ele.bind("click", function (){
                    me.check();
                });
            }
            else if(type == "Select"){
                field.unbind_events();
                ele.bind("change", function (){
                    me.check();
                });
            }
            else if(type == "And" || type == "Or"){
                var fields = field.fields;
                for (var i=0, len=fields.length; i<len; i++){
                    me._bind_events(fields[i]);
                }
            }
            
        }
    };

    auth.Field.And.prototype = {
        init : field_or_proto.init,
        add : field_or_proto.add,
        setMsg : field_or_proto.setMsg,
        showMsg : field_or_proto.showMsg,
        _bind_events : field_or_proto._bind_events,
        setFocus : field_or_proto.setFocus,
        setDisabled : text_proto.setDisabled,
        on : text_proto.on,
        off : text_proto.off,
        check : function (){
            var me = this;
            if (me.disabled) return true; // 如果禁用

            for (var i=0, len=me.fields.length, field; i<len; i++){
                field = me.fields[i];
                if (!field.check()){
                    me.error_field = field;
                    me.showMsg(me.msg);
                    return false;
                }
            }
            me.showMsg(comment.ok, "fa-ok");
            return true;
        }
    };


    /*****************************************/
    /*            规则定义                   */
    /*****************************************/
    auth.Rule = {};
    auth.Rule.And = class_new();
    auth.Rule.Or = class_new();
    auth.Rule.Not = class_new();
    var BaseRule = auth.Rule.BaseRule = {};

    BaseRule.Regexp = class_new();
    BaseRule.Func = class_new();
    BaseRule.IO = class_new();
    
    /*****************************************/
    /*            规则实现                   */
    /*****************************************/
    var rule_type = auth.Rule.type = function (obj){
        var rule = auth.Rule;
        var baseRule = rule.BaseRule;

        var table = {
            And : rule.And,
            Or : rule.Or,
            Not : rule.Not,
            Regexp : baseRule.Regexp,
            Func : baseRule.Func,
            IO : baseRule.IO
        };
        
        for (var _type in table){
            if (obj instanceof table[_type]) return _type;
        }

        return "unknow";
    };
    
    // 是否是同步规则
    var sync_type = auth.Rule.syncType = function (obj){
        var _type = rule_type(obj);
        return !(_type == "IO");
    };
    
    // 组合规则中只允许出现同步规则
    auth.Rule.And.prototype = {
        init : function (){
            this.rules = [];
            this.msg = "";
        },
        add : function (){
            var rules = [].slice.call(arguments);

            for (var i=0, rule, len=rules.length; i<len; i++){
                rule = rules[i];
                if (!sync_type(rule)) error("组合规则中只能出现同步规则!");
                this.rules.push(rule);
            }

            return this;
        },
        check : function (ele){
            var rules = this.rules;
            for (var i=0, len=rules.length, rule; i<len; i++){
                rule = rules[i];
                if (!rule.check(ele)) {
                    this.msg = rule.msg;
                    return false;
                }
            }
            return true;
        }
    };

    auth.Rule.Or.prototype = {
        init : auth.Rule.And.prototype.init,
        add : auth.Rule.And.prototype.add,
        
        check : function (ele){
            var rules = this.rules;            

            for (var i=0, len=rules.length, rule; i<len; i++){
                rule = rules[i];
                if (rule.check(ele)) return true;
            }

            this.msg = rule.msg;
            return false;
        }
    };

    auth.Rule.Not.prototype = {
        init : function (rule){
            if (!sync_type(rule)) error("组合规则中只能出现同步规则!");
            this.rule = rule;
            this.msg = this.rule.msg;
        }
        ,check : function (ele){
            return !this.rule.check(ele);
        }
    };

    BaseRule.Regexp.prototype = {
        init : function (regexp, msg){
            this.regexp = regexp;
            this.msg = msg || "";
        },
        check : function (ele){
            return this.regexp.test(ele.value());
        }
    };

    BaseRule.Func.prototype = {
        init : function (func, msg){
            this.func = func;
            this.msg = msg || "";
        },
        check : function (ele){
            return this.func(ele);
        }
    };

    BaseRule.IO.prototype = {
        init : function (request, msg, check_func){
            this.request = request;
            this.msg = msg;
            this.check_func = check_func;
        },
        check : function (ele){
            var me = this, defer;
            var name = ele.name;
            var value = ele.value();

            defer = $.Deferred();
            me.xhr = $.ajax({
                type : "post",
                url : me.request,
                dataType : "json",
                success : function (ret){
                    if (me.check_func(ret)) defer.resolve(ele);
                    else defer.reject(ele);
                },
                error : function (){
                    defer.reject(ele);
                }
            });

            return defer;
        }
    };
    
    /*****************************************/
    /*         常用规则实例                  */
    /*****************************************/

    // 必填
    auth.required = function (msg){
        var fn = function (ele){
            var _type = ele.element.prop("type");
            
            if (_type == "select-one"){
                return ele.value() != -1;
            }
            else if (_type == "radio" || _type == "checkbox"){
                return ele.element.filter(function (){return $(this).attr("checked")}).length > 0 ? true : false;
            }
            else {
                var value = ele.value();
                return (value != null) && (value.toString().length > 0);
            }
        }; 

        return new BaseRule.Func(fn, msg);
    };

    // 可为空
    auth.empty = function (){
        var fn = function (ele){
            var value = ele.value();
            return (value == null) || (value.toString().length == 0);
        };

        return new BaseRule.Func(fn, "");
    };

    // 最小长度
    auth.minLength = function (len, msg, is_real){
        var fn = function (ele){
            var value = ele.value().toString();
            return str_length(value, is_real) >= len;
        };

        return new BaseRule.Func(fn, msg);
    };

    // 最大长度
    auth.maxLength = function (len, msg, is_real){
        var fn = function (ele){
            var value = ele.value().toString();
            return str_length(value, is_real) <= len;
        };

        return new BaseRule.Func(fn, msg);
    };

    /*****************************************/
    /*            语法糖                     */
    /*****************************************/
    
    auth.field = function (name){
        var ele = element_name(name);
        if (!ele) return null;

        var ele_type = ele.prop("type");
        var obj = null;

        switch (ele_type){
            case "text":
            case "file":
            case "hidden":
            case "textarea":
            case "password":
                obj = new BaseField.Text(name);
                break;

            case "radio":
                obj = new BaseField.Radio(name);
                break;
            
            case "select-one":
            case "select-multiple":
                obj = new BaseField.Select(name);
                break;
            
            case "checkbox":
                obj = new BaseField.Checkbox(name);
                break;
        }

        return obj;
    };

    auth.rule = function (){
        var args = [].slice.call(arguments); 
        var rule_type = js_type(args[0]);
        var obj = null;
        
        switch (rule_type){
            case "regexp":
                obj = new BaseRule.Regexp(args[0], args[1]);
                break;
            case "function":
                obj = new BaseRule.Func(args[0], args[1]);
                break;
            default:
                obj = new BaseRule.IO(args[0], args[1], args[2]);
        }
        
        return obj;
    };
    
    var and_or = function (_type){
        _type = _type == "And" ? "And" : "Or";
        
        var fn = function (){
            var args = arguments;
            var obj = null;

            // 如果没有参数, 默认为field
            if (args.length == 0) return new Field[_type]();
            
            // 根据第一个参数来决定field?rule?
            if (field_type(args[0]) != "unknow"){
                obj = new auth.Field[_type]();
            }
            else if (rule_type(args[0]) != "unknow"){
                obj = new auth.Rule[_type]();
            }

            // 如果都不是
            if (!obj) return obj;

            for (var i=0, child, len=args.length; i<len; i++){
                child = args[i];
                obj.add(child);
            }

            return obj;
        };

        return fn;
    };

    auth.and = and_or("And");
    auth.or = and_or("Or");

    auth.not = function (){
        return new auth.Rule.Not(auth.rule.apply(null, arguments));
    };
    
    PureJS.noticeSys("formAuth.js");
});